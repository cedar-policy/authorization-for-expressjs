import { ApiHttpMethod, SUPPORTED_HTTP_METHODS, StringifiedSchema, Tools } from "@cedar-policy/cedar-authorization";
import { ActionType, SchemaJson } from "@cedar-policy/cedar-wasm";


export interface SimpleRestAuthMapping {
    cedarActionName: string;
    actionDefinition: ActionType<string>;
    pathTemplate: string;
};
export interface SimpleRestAuthMappingHash {
    namespace: string;
    mapper: Record<ApiHttpMethod, Array<SimpleRestAuthMapping>>;
}

/**
 * This function takes a stringified schema, verifies it conforms to the simpleRestActionMapping (ie, it verifies it has 
 * all the right annotations), and if so, returns a data structure keyed by http verb. The intention is that when a request comes in,
 * we don't have to path-match against all of the server's handlers but only against the ones that use the current http verb.
 * For example, if it's a get request then we don't need to check any handlers that are post, put, patch, or delete.
 * @param schemaStr stringified schema
 * @returns ActionMappingsByHttpVerb
 */
export function parseMappingFromStringifiedSchema(schemaStr: StringifiedSchema): SimpleRestAuthMappingHash {
    const cedarLib = require('@cedar-policy/cedar-wasm/nodejs');
    const schema = JSON.parse(Tools.validateSchemaJson(cedarLib, schemaStr)) as SchemaJson<string>;
    // now check if the mappingType is actually valid
    const namespaces = Object.keys(schema);
    if (namespaces.length !== 1) {
        throw new Error(`Schema validation failed: schema must have exactly one namespace`);
    }
    const namespace = namespaces[0];
    const schemaFragment = schema[namespace];
    const type = schemaFragment.annotations?.mappingType;
    if (!type) {
        throw new Error(`Schema validation failed: mappingType annotation not found`);
    }
    if (type !== 'SimpleRest') {
        throw new Error(`Schema validation failed: mappingType ${schemaFragment.annotations?.mappingType} is not valid`);
    }
    const simpleRestAuthMappingHash: SimpleRestAuthMappingHash = {
        namespace,
        mapper: {
            get: [],
            post: [],
            put: [],
            patch: [],
            delete: [],
        },
    };
    // now check if all the actions have a valid httpVerb and httpPathTemplate and build the verbMap
    for (const actionName in schemaFragment.actions) {
        const actionDefn = schemaFragment.actions[actionName];
        if (!actionDefn) {
            throw new Error(`Schema validation failed: action ${actionName} not found`);
        }
        if (!actionDefn.annotations?.httpVerb) {
            throw new Error(`Schema validation failed: action ${actionName} has no httpVerb`);
        
        }
        if (!(<string[]>SUPPORTED_HTTP_METHODS).includes(actionDefn.annotations.httpVerb)) {
            throw new Error(`Schema validation failed: action ${actionName} has an invalid httpVerb ${actionDefn.annotations?.httpVerb}`);
        }
        if (!actionDefn.annotations?.httpPathTemplate) {
            throw new Error(`Schema validation failed: action ${actionName} has no httpPathTemplate`);
        }
        const httpVerbFromAnnotation: ApiHttpMethod = actionDefn.annotations.httpVerb as ApiHttpMethod;
        simpleRestAuthMappingHash.mapper[httpVerbFromAnnotation].push({
            cedarActionName: actionName,
            actionDefinition: actionDefn,
            pathTemplate: actionDefn.annotations.httpPathTemplate,
        });
    }
    return simpleRestAuthMappingHash;
}