import { Request, Response, NextFunction } from 'express';
import {
    Entity,
    ApiHttpMethod,
    StringifiedSchema,
    AuthorizationRequest,
    SUPPORTED_HTTP_METHODS,
    AuthorizationEngine,
    EntityUid,
} from "@cedar-policy/cedar-authorization";
import { Match, match, MatchFunction, ParamData } from 'path-to-regexp';
import { IncomingHttpHeaders } from 'http';
import { parseMappingFromStringifiedSchema, SimpleRestAuthMapping } from './buildOptimizedAuthMapping';
import { CedarValueJson } from '@cedar-policy/cedar-wasm';

/**
 * Middleware provider
 */
    
type PrincipalMapping<TRequest> = 
    {type: 'identityToken'} |
    {type: 'accessToken'} |
    {
        type: 'custom',
        getPrincipalEntity: (req: TRequest) => Promise<Entity>,
    };
type ContextMapping<TRequest> =
  | { type: 'auto' }
  | { type: 'empty' }
  | { type: 'custom'; getContext: (req: TRequest) => Record<string, CedarValueJson> };

type ActionProvider<TRequest> = () => EntityUid;
type ResourceProvider<TRequest> = (req: TRequest) => Promise<Entity>;
type EntitiesProvider<TRequest> = (req: TRequest) => Promise<Entity[]>;

interface RequestSpecificMiddlewareConfig<TRequest> {
    actionProvider?: ActionProvider<TRequest>;
    resourceProvider?: ResourceProvider<TRequest>;
    entitiesProvider?: EntitiesProvider<TRequest>;
}
interface ExpressAuthorizationMiddlewareConfig {
    schema: StringifiedSchema;
    authorizationEngine: AuthorizationEngine;
    principalConfiguration: PrincipalMapping<Request>;
    contextConfiguration?: ContextMapping<Request>;
    skippedEndpoints?: Array<{httpVerb: string, path: string}>;
    logger?: {
        debug?: (message: string) => void;
        log: (message: string) => void;
    };
}

type Express5SpecificPathMapper = Record<ApiHttpMethod, Array<SimpleRestAuthMapping & { matcher: MatchFunction<ParamData>}>>;
type Express5PathParams = Partial<Record<string, string | string[]>>;
export class ExpressAuthorizationMiddleware {
    private readonly config: ExpressAuthorizationMiddlewareConfig;
    private readonly getPrincipalEntity: (req: Request) => Promise<Entity>;
    private readonly contextConfiguration: ContextMapping<Request>;
    private readonly expressSpecificMapper: Express5SpecificPathMapper;
    private readonly namespace: string;
    constructor(config: ExpressAuthorizationMiddlewareConfig){
        if (!config) {
            throw new Error('Config is required');
        }
        if (!config.schema) {
            throw new Error('Schema is required');
        }
        const {namespace, mapper: simpleRestAuthMappingHash} = parseMappingFromStringifiedSchema(config.schema);
        this.namespace = namespace;
        this.expressSpecificMapper = {
            get: [],
            post: [],
            put: [],
            patch: [],
            delete: [],
        };
        for (const verb of SUPPORTED_HTTP_METHODS){
            this.expressSpecificMapper[verb] = simpleRestAuthMappingHash[verb].map(actionMatcher => {
                return {
                    ...actionMatcher,
                    matcher: match(convertOpenAPIPathToExpress(actionMatcher.pathTemplate)),
                }
            });
        }
        if (!config.authorizationEngine) {
            throw new Error('Authorizer is required');
        }
        if (!config.principalConfiguration || !['accessToken', 'identityToken', 'custom'].includes(config.principalConfiguration.type)) {
            throw new Error(`Principal Factory configuration required. Valid types: {type: 'accessToken'} | {type: 'identityToken'} | { type: 'custom', getPrincipalEntity: (req) => Promise<Entity>`);
        }
        
        this.contextConfiguration = config.contextConfiguration || { type: 'empty' };
        if (config.principalConfiguration.type === 'custom') {
            this.getPrincipalEntity = config.principalConfiguration.getPrincipalEntity;
        } else {
            this.getPrincipalEntity = async function(req) {
                const authorizationHeader = req.headers["Authorization"] || req.headers['authorization'];
                if (!authorizationHeader) {
                    throw new Error('Authorization header must be present');
                }
                if (Array.isArray(authorizationHeader)){
                    throw new Error('Multiple authorization header values were present');
                }
                let token = authorizationHeader;
                if (token.toLowerCase().startsWith("bearer")) {
                    token = token.split(' ')[1];
                } else {
                    throw new Error('Authorization header must be a bearer token');
                }
                return {
                    uid: {
                        type: 'Principal',
                        id: token,
                    },
                    attrs: {},
                    parents: [],
                };
            }
        }
        this.config = config;
    }
    protected getMatchedAction = (req: Request): {status: number, error: string} | SimpleRestAuthMapping => {
        const apiMethod = req.method.toLowerCase() as ApiHttpMethod;
        const currentUrl = req.originalUrl;

        const actionMatchersForThisVerb = this.expressSpecificMapper[apiMethod];
        
        const matchedResultsForVerb = actionMatchersForThisVerb.filter(actionMatcher => {
            const matchResult = actionMatcher.matcher(currentUrl);
            return !!matchResult;
        });
        if (matchedResultsForVerb.length === 0) {
            this.config.logger?.debug?.('Returning 404 due to no result matched');
            return {
                status: 404,
                error: 'Not Found',
            };
        }
        if (matchedResultsForVerb.length > 1) {
            this.config.logger?.debug?.('Returning 500 due to multiple matched paths');
            return {
                status: 500,
                error: 'Internal Server Error',
            }
        }
        const matchedAction = matchedResultsForVerb[0];
        const matchResult: Match<Express5PathParams> | false = matchedAction.matcher(currentUrl);
        if (!matchResult) {
            return {
                status: 404,
                error: 'Path not found',
            };
        }
        return matchedAction;
    }
    middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const httpVerb = req.method.toLowerCase();
        const currentUrl = req.originalUrl;
        
        if (shouldBeSkipped(this.config.skippedEndpoints || [], httpVerb, currentUrl)) {
            next();
            return;
        }
        if (!(<string[]>SUPPORTED_HTTP_METHODS).includes(httpVerb)) {
            this.config.logger?.debug?.(`Exiting middleware due to unsupported http verb: ${httpVerb}`);
            next();
            return;
        }
        const matchedAction = this.getMatchedAction(req);
        if ('status' in matchedAction) {
            res.status(matchedAction.status).send(matchedAction.error);
            return;
        }
        try {
            const principalEntity = await this.getPrincipalEntity(req);
            const principal = principalEntity.uid;
            const action = {
                type: `${this.namespace}::Action`,
                id: matchedAction.cedarActionName,
            };
            const resource = defaultResourceUid(this.namespace);
            const context = mapContext(req, this.contextConfiguration);
            const authRequest: AuthorizationRequest = {
                principal,
                action,
                resource,
                context,
            };
            const entities = [];
            if (this.config.principalConfiguration.type === 'custom') {
                entities.push(principalEntity);
            }
            this.config.logger?.debug?.(`Authz Request: ${JSON.stringify(authRequest)}`);
            this.config.logger?.debug?.(`Authz Entities: ${JSON.stringify(entities)}`);
            const authorizationResult = await this.config.authorizationEngine.isAuthorized(authRequest, entities);
            this.config.logger?.debug?.(`Authorization result: ${JSON.stringify(authorizationResult)}`);
            switch(authorizationResult.type) {
                case 'allow': {
                    res.locals = res.locals || {};
                    Object.assign(res.locals, {
                        authorizerInfo: authorizationResult.authorizerInfo,
                    });
                    next();
                    return;
                }
                case 'deny': {
                    res.status(401).send("Not authorized with explicit deny");
                    return;
                }
                case 'error': {
                    this.config.logger?.log(`${authorizationResult.message}`);
                    res.status(500).send(`Authorizer internal error`);
                    return;
                }
            }
        } catch (e) {
            this.config.logger?.log(`${e}`);
            res.status(500).send('Internal Server Error during authorization');
            return;
        }
    }
    handlerSpecificMiddleware = (config: RequestSpecificMiddlewareConfig<Request>) => 
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const principalEntity = await this.getPrincipalEntity(req);
            let action: EntityUid;
            if (config.actionProvider) {
                action = config.actionProvider();
            } else {
                const matchedAction = this.getMatchedAction(req);
                if ('status' in matchedAction) {
                    res.status(matchedAction.status).send(matchedAction.error);
                    return;
                }
                action = {
                    type: `${this.namespace}::Action`,
                    id: matchedAction.cedarActionName,
                };
            }
            
            let resource: Entity|undefined = undefined;
            if (typeof config.resourceProvider === 'function') {
                const resourceResult = await applyResourceFetcherCallback(
                    () => config.resourceProvider!(req),
                    this.config.logger?.debug,
                );
                if (!resourceResult || !resourceResult.attrs) {
                    res.status(400).send('Invalid request');
                    return;
                }
                resource = resourceResult;
            }
            let entities: Entity[] = [];
            if (config.entitiesProvider) {
                const entitiesResult = await applyEntitiesFetcherCallback(
                    () => config.entitiesProvider!(req),
                    this.config.logger?.debug,
                );
                if (!entitiesResult) {
                    res.status(400).send('Invalid request');
                    return;
                }
                entities = entitiesResult;
            }
            
            if (this.config.principalConfiguration.type === 'custom') {
                entities.push(principalEntity);
            }
            if (resource) {
                entities.push(resource);
            }
            const authRequest = {
                principal: principalEntity.uid,
                action: action,
                resource: resource ? resource.uid : defaultResourceUid(this.namespace),
                context: mapContext(req, this.contextConfiguration),
            }
            this.config.logger?.debug?.(`Authz Request: ${JSON.stringify(authRequest)}`);
            this.config.logger?.debug?.(`Authz Entities: ${JSON.stringify(entities)}`);
            const authorizationResult = await this.config.authorizationEngine.isAuthorized(authRequest, entities);
            switch(authorizationResult.type) {
                case 'allow': {
                    res.locals = res.locals || {};
                    const authorizerInfo = authorizationResult.authorizerInfo;
                    if (resource) {
                        Object.assign(authorizerInfo, {
                            resource: resource,
                        });
                    }
                    Object.assign(res.locals, { authorizerInfo });
                    next();
                    return;
                }
                case 'deny': {
                    res.status(401).send("Not authorized with explicit deny");
                    return;
                }
                case 'error': {
                    this.config.logger?.log(`${authorizationResult.message}`);
                    res.status(500).send(`Authorizer internal error`);
                    return;
                }
            }
        } catch (e) {
            this.config.logger?.log(`${e}`);
            if (e && typeof e === 'object' && 'stack' in e) {
                this.config.logger?.log(e.stack as string);
            }
            res.status(500).send('Internal Server Error during authorization');
            return;
        }
    }
}

async function applyResourceFetcherCallback(
    cb: () => Promise<Entity>,
    debugLogger?: (message: string) => void
) {
    try {
        const result = await cb();
        return result;
    } catch (e) {
        debugLogger?.(`Error during resource fetcher callback: ${e}`);
        return false;
    }
}
async function applyEntitiesFetcherCallback(
    cb: () => Promise<Entity[]>,
    debugLogger?: (message: string) => void
) {
    try {
        const result = await cb();
        return result;
    } catch (e) {
        debugLogger?.(`Error during resource fetcher callback: ${e}`);
        return false;
    }
}


export function flattenPathParams(pathParams: Partial<Record<string, string | string[]>>): Record<string, string[]> {
    const flattened: Record<string, string[]> = {};
    for (const key in pathParams) {
        const value = pathParams[key];
        if (Array.isArray(value)) {
            flattened[key] = value;
        } else if (typeof value === 'string') {
            flattened[key] = [value];
        }
    }
    return flattened;
}

type QueryType = Request['query'];
export function flattenQueryString(parsedQs: QueryType): Record<string, string[]> {
    const flattened: Record<string, string[]> = {};
    for (const key in parsedQs) {
        const value = parsedQs[key];
        if (Array.isArray(value)) {
            flattened[key] = value.map(v => typeof v === 'string' ? v : `${JSON.stringify(v)}`);
        } else if (typeof value === 'string') {
            flattened[key] = [value];
        } else {
            flattened[key] = [`${JSON.stringify(value)}`];
        }
    }
    return flattened;
}

export function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string[]> {
    const normalizedHeaders: Record<string, string[]> = {};
    for (const key in headers) {
        const value = headers[key];
        if (Array.isArray(value)) {
            normalizedHeaders[key] = value;
        } else if (typeof value === 'string') {
            normalizedHeaders[key] = [value];
        }
    }
    return normalizedHeaders;
}

export function convertOpenAPIPathToExpress(openAPIPath: string) {
    const errorMsg = (path: string) => `Invalid path: ${path}. Valid paths must contain only alphanumeric characters, letters, dashes, or path variables in the format {varName}.`;
    if (!openAPIPath || typeof openAPIPath !== 'string') {
        throw new Error(errorMsg(openAPIPath));
    }
    const parts = openAPIPath.split('/');
    for (const pathPart of parts) {
        if (pathPart.match(/[^-_a-zA-Z0-9\{\}]/ )) {
            throw new Error(errorMsg(openAPIPath));
        }
    }

    return openAPIPath
        .replace(/\{/g, ':')
        .replace(/\}/g, '');
}

/**
 * This function decides if the current endpoint should be skipped. There are these cases:
 * 1. One of the `skippedEndpoint`s matches the current url exactly
 * 2. They expresed the `skippedEndpoint` as an express path
 * @param configSkippedEndpoints endpoints to be skipped according to the middleware configuration
 * @param httpVerb http verb of the current request
 * @param currentUrl url that was hit in the present request
 */
export function shouldBeSkipped(configSkippedEndpoints: ExpressAuthorizationMiddlewareConfig['skippedEndpoints'], currentHttpVerb: string, currentUrl: string): boolean {
    if (typeof currentUrl !== 'string') {
        return false;
    }
    const skippedPathsForThisVerb: string[] = (configSkippedEndpoints || [])
        .filter(se => se.httpVerb === currentHttpVerb)
        .map(se => se.path);
    // express should trim away query strings but just to be safe:
    const urlWithNoQuery = currentUrl.split('?')[0];
    if (skippedPathsForThisVerb.includes(urlWithNoQuery)) {
        return true;
    }
    for (const path of skippedPathsForThisVerb) {
        if (match(path)(urlWithNoQuery)) {
            return true;
        }
    }
    return false;
}

function defaultResourceUid(namespace: string) {
    return {
        type: `${namespace}::Application`,
        id: namespace,
    };
}

function mapContext(req: Request, contextConfiguration: ContextMapping<Request>) {
    switch (contextConfiguration.type) {
        case 'auto': {
            return {
                pathParameters: flattenPathParams(req.params),
                queryStringParameters: flattenQueryString(req.query || {}),
            };
        }
        case 'empty': {
            return {};
        }
        case 'custom': {
            return contextConfiguration.getContext(req);
        }
    }

}

export { CedarInlineAuthorizationEngine } from '@cedar-policy/cedar-authorization';