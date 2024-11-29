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
exports.validateToken = void 0;
const AWS = __importStar(require("aws-sdk"));
const lambda = new AWS.Lambda();
const logger = require('lambda-log');
// Función que valida el token
const validateToken = async (token) => {
    try {
        // Obtener el nombre de la función de validación desde las variables de entorno
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        if (!validateFunctionName) {
            throw new Error('Error interno del servidor: falta configuración de la función de validación');
        }
        // Invocar la función Lambda ValidateAccessToken para validar el token
        const payload = {
            token,
        };
        const invokeResponse = await lambda
            .invoke({
            FunctionName: validateFunctionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(payload),
        })
            .promise();
        // Leer y cargar la respuesta de la invocación
        const responsePayload = JSON.parse(invokeResponse.Payload);
        logger.info('Response from ValidateAccessToken:', responsePayload);
        // Verificar si el token es válido
        if (responsePayload.statusCode === 403) {
            throw new Error('Acceso No Autorizado');
        }
        // Devuelve tenant_id y student_id
        return {
            tenant_id: responsePayload.tenant_id,
            student_id: responsePayload.student_id,
        };
    }
    catch (error) {
        logger.error('Error en la validación del token:', error);
        throw error; // Lanzamos el error para que el handler lo maneje
    }
};
exports.validateToken = validateToken;
//# sourceMappingURL=validateToken.js.map