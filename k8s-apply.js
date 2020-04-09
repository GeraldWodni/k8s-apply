/* Minimalistic kubernetes api interface - no dependencies */
/* (c)copyright 2020 by Gerald Wodni <gerald.wodni@gmail.com> */
const fs = require("fs");
const https = require("https");
const tls = require("tls");

/* get credentials */
const certificate = fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").toString();
const token = fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token").toString();

function defaults( target, defaults ) {
    Object.keys( defaults ).forEach( key => {
        if( !(key in target) )
            target[ key ] = defaults[ key ];
    });
    return target;
}

class K8sApi {
    constructor() {
        /* Monkey patch TLS to add Kubernetes' self signed certificate */
        /* see: https://medium.com/trabe/monkey-patching-tls-in-node-js-to-support-self-signed-certificates-with-custom-root-cas-25c7396dfd2a */
        const origCreateSecureContext = tls.createSecureContext;
        tls.createSecureContext = options => {
            const context = origCreateSecureContext( options );
            context.context.addCACert( certificate );
            return context;
        };
    }

    /* raw request */
    async request( path, options ) {
        /* default options */
        options = options || {};
        defaults( options, {
            hostname: process.env.KUBERNETES_SERVICE_HOST,
            port: 443,
            path: path,
            method: "GET",
            headers: {}
        });

        /* default headers */
        defaults( options.headers, {
            Authorization: "Bearer "+token
        });
        console.log( "REQUEST", options.method, path );

        return new Promise( (fulfill, reject) => {
            const req = https.request(options, res => {
                var data = "";
                res.on("data", chunk => data+=chunk.toString());
                res.on("end", () => fulfill( { statusCode: res.statusCode, data: JSON.parse( data ) } ) );
            });
            req.on( "error", reject );
            if( options.postData )
                req.write( options.postData );
            req.end();
        });
    }

    /* convenience method wrappers */
    async get( path, options ) {
        return this.request( path, defaults( options || {}, { method: "GET" } ) );
    }
    async post( path, object, options ) {
        const body = JSON.stringify( object );
        return this.request( path, defaults( options || {}, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength( body )
            },
            postData: body
        }));
    }
    async put( path, object, options ) {
        return this.post( path, object, { method: "PUT" });
    }
    async del( path, options ) {
        return this.request( path, { method: "DELETE" });
    }

    getPluralPath( object ) {
        return `/api${object.apiVersion.indexOf("/")>0?"s":""}/${object.apiVersion}/namespaces/${object.metadata.namespace}/${object.kind.toLowerCase()}s`;
    }

    /* simulate the behaviour of kubectl apply */
    async applyObject( object ) {
        var path = this.getPluralPath( object );
        return this.post( path, object )
        .then( res => {
            /*  no conflict? return! */
            if( res.statusCode != 409 )
                return res;

            /* conflict: try update(PUT) instead of create(POST) */
            path +=`/${object.metadata.name}`;
            return this.get( path )
            .then( ({ statusCode, data: getObject }) => {
                if( statusCode != 200 )
                    throw new Error( "k8s-apply cannot get object: " + statusCode + "\n" + JSON.stringify( getObject, null, 4 ) );
                object.metadata.resourceVersion = getObject.metadata.resourceVersion;
                return this.put( path, object );
            });
        });
    }

    /* simulate the behaviour of kubectl delete */
    async delObject( object ) {
        var path = this.getPluralPath( object )+`/${object.metadata.name}`;
        return this.del( path );
    }
}

module.exports = K8sApi
