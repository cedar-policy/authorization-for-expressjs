// EMPOYEE_POLICY
// Allows employee user group access to all API actions
permit (
    principal in PetStoreApp::UserGroup::"employee",
    action in
        [PetStoreApp::Action::"GET /pets",
         PetStoreApp::Action::"POST /pets",
         PetStoreApp::Action::"GET /pets/{petId}",
         PetStoreApp::Action::"POST /pets/{petId}/sale"],
    resource
);