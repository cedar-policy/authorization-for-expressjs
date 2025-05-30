// CUSTOMER_POLICY
// Allows customer user group access getAllPets and getPetById
permit (
    principal in PetStoreApp::UserGroup::"customer",
    action in
        [PetStoreApp::Action::"GET /pets",
         PetStoreApp::Action::"GET /pets/{petId}"],
    resource
);