"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const AWS = __importStar(require("aws-sdk"));
const validateToken_1 = require("../utils/validateToken"); // Asegúrate de que la ruta sea correcta
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME;
const handler = async (event) => {
    try {
        // Obtener el token de autorización desde los headers
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Falta el token de autorización' }),
            };
        }
        // Validar el token
        const { tenant_id, student_id } = await (0, validateToken_1.validateToken)(token);
        console.log(`Token validado: tenant_id = ${tenant_id}, student_id = ${student_id}`);
        const body = JSON.parse(event.body || '{}');
        // Verificar que se haya proporcionado el `rockie_id`
        if (!body.rockie_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Falta el campo rockie_id' }),
            };
        }
        // Verificar si el Rockie existe en la tabla
        const getRockieResponse = await dynamoDb
            .get({
            TableName: tableName,
            Key: {
                tenant_id,
                rockie_id: body.rockie_id, // Usamos `rockie_id` como clave primaria o secundaria
            },
        })
            .promise();
        if (!getRockieResponse.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Rockie no encontrado' }),
            };
        }
        // Eliminar el "Rockie" de DynamoDB
        await dynamoDb
            .delete({
            TableName: tableName,
            Key: {
                tenant_id,
                rockie_id: body.rockie_id,
            },
        })
            .promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Rockie eliminado correctamente' }),
        };
    }
    catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error interno al eliminar el Rockie',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=deleteRockie.js.map