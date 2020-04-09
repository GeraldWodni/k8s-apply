## A minimalistic kubernetes api interface - without any dependencies

All methods return promises, so they can be bundled by using `async`/`await`.
The library assumes to be used inside the cluster.
Certificates and Tokens are read from `/var/run/secrets/kubernetes.io/serviceaccount`.

## Function
All API calls are performed over the REST interface using node.js' internal `https` module.
In order to allow a self signed certificate (as used by kubernetes), the certificate is monkey patched into `tls.createSecureContext`, see [this article by David Barral](https://medium.com/trabe/monkey-patching-tls-in-node-js-to-support-self-signed-certificates-with-custom-root-cas-25c7396dfd2a).

### Raw request
Use only if you want to do something exotic: 

```javascript
const k8sApi = new K8sApi();

const { statusCode, data } = await k8sApi.request( "/apis/my-extensions.example.com/v1/namespaces/my-namespace/extension-name?pretty=true" );
console.log( "List Example:", statusCode, JSON.stringify( data, null, 4 ) );
```

`request` by default performs a `GET`, so the above call is equal to `k8sApi.get(...)`

### HTTP Wrappers
To provide more comfort around the raw call the following wrapper functions are provided: 
- `async get( path, options )` - list objects or receive single object (add object name to the end of path)
- `async post( path, object, options )` - post (create) new object
- `async put( path, object, options )` - replace existing object
- `async del( path, options )` - delete existing object

All wrappers return the raw-request object consisting of:
- `statusCode` of the HTTP request
- `data` JSON response body (already parsed as object)

### Apply object
If one wants to mimic the behaviour of `kubectl apply`, this function does that:

`async applyObject( object )`

It works as follows:
1. Construct resource plural-path from object (assumes simple `s` for plural name).
2. Attempts to create object
3. If that works or fails hard the result is returned - goto 8.
4. If a 409 (Conflict) is returned, the object already exists
5. Read current object to receive the resourceVersion
6. If read fails (i.e. get permission not present in ClusterRole), the result is returned - goto 8.
7. Attempt to replace object using the existing name and the fetched resourceVersion
8. return result

#### Example:
If you have your object stored in YAML, you can use the library `js-yaml` library.

```javascript
const YAML = require("js-yaml");
const fs = require("fs");
const object = YAML.load( fs.readFileSync("service.yaml") );
try {
    const { statusCode, data } = await k8sApi.applyObject( object );
    console.log( "APPLY", statusCode+"\n", JSON.stringify( data, null, 4 ) );
} catch( err ) {
    console.log( "APPLY Failed,", err );
}
```

### Delete object
Constructs the delete-path from the provided object

`async delObject( object )`

#### Example:
```javascript
const YAML = require("js-yaml");
const fs = require("fs");
const object = YAML.load( fs.readFileSync("service.yaml") );
console.log( "YAML:", JSON.stringify(object, null, 4) );
try {
    const { statusCode, data } = await k8sApi.delObject( object );
    console.log( "DELETE:", statusCode+"\n", JSON.stringify( data, null, 4 ) );
} catch( err ) {
    console.log( "DELETE Failed,", err );
}
```

### `async`/`await` Example
If you are new to `async` and `await`, here is how you can serialize apply and delete quite simple:

```javascript
async function main() {
    /* use nested function to reuse names for `applyExample` and `delExample` */
    async function applyExample() {
        const YAML = require("js-yaml");
        const fs = require("fs");
        const object = YAML.load( fs.readFileSync("service.yaml") );
        console.log( "YAML:", JSON.stringify(object, null, 4) );
        try {
            const { statusCode, data } = await k8sApi.applyObject( object );
            console.log( "APPLY:", statusCode+"\n", JSON.stringify( data, null, 4 ) );
        } catch( err ) {
            console.log( "APPLY Failed,", err );
        }
    }
    await applyExample();

    /* list instances - use object destructure and renaming */
    let { statusCode: listStatusCode, data: listData } = await k8sApi.get("/api/v1/namespaces/my-namespace/services");
    console.log( "List Status:", listStatusCode+"" );
    listData.items.forEach( item => console.log( "Service:", JSON.stringify( item, null, 4 ) ) );

    async function delExample() {
        const YAML = require("js-yaml");
        const fs = require("fs");
        const object = YAML.load( fs.readFileSync("service.yaml") );
        console.log( "YAML:", JSON.stringify(object, null, 4) );
        try {
            const { statusCode, data } = await k8sApi.delObject( object );
            console.log( "DELETE:", statusCode+"\n", JSON.stringify( data, null, 4 ) );
        } catch( err ) {
            console.log( "DELETE Failed,", err );
        }
    }
    await delExample();
}
main();
```

## Motivation
The popular kubernetes-client uses TypeScript and consists of a lot of hollow classes.
This is fine if you like languages like Java, but can feel a bit alien if you are used to terser syntax.
I do use kubernetes-client in some projects, but find it quite hard to look for the proper class to use, and do not see a benefit in looking up class names.
To better understand my reasoning here, feel free to read [this article by Lucas Chen](https://dev.to/bettercodingacademy/typescript-is-a-waste-of-time-change-my-mind-pi8)

If you want to just apply an existing YAML, this library allows you to do just that in very few lines of code (see example above).
