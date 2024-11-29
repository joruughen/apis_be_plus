"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = void 0;
const client_lambda_1 = require("@aws-sdk/client-lambda"); // AWS SDK v3 para invocar Lambda
const winston_1 = require("winston"); // Logger winston
// Crear una instancia del cliente Lambda con AWS SDK v3
const lambda = new client_lambda_1.LambdaClient({ region: 'us-east-1' }); // Asegúrate de usar la región correcta
// Crear el logger de winston
const logger = (0, winston_1.createLogger)({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.timestamp(), winston_1.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
    })),
    transports: [
        new winston_1.transports.Console(), // Usar consola para los logs
    ],
});
// Función que valida el token
const validateToken = async (token) => {
    try {
        // Obtener el nombre de la función de validación desde las variables de entorno
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        if (!validateFunctionName) {
            throw new Error('Error interno del servidor: falta configuración de la función de validación');
        }
        // Crear el payload para enviar a la función Lambda
        const payload = { token };
        // Crear el comando para invocar la función Lambda
        const command = new client_lambda_1.InvokeCommand({
            FunctionName: validateFunctionName,
            InvocationType: 'RequestResponse', // 'RequestResponse' es para esperar la respuesta
            Payload: Buffer.from(JSON.stringify(payload)), // Convertir el payload en un Buffer
        });
        // Invocar la función Lambda usando AWS SDK v3
        const invokeResponse = await lambda.send(command);
        // Leer y cargar la respuesta de la invocación
        const responsePayload = JSON.parse(new TextDecoder().decode(invokeResponse.Payload));
        // Log de la respuesta
        logger.info('Response from ValidateAccessToken:', responsePayload);
        // Verificar si el token es válido
        if (responsePayload.statusCode === 403) {
            throw new Error('Acceso No Autorizado');
        }
        // Devolver tenant_id y student_id
        return {
            tenant_id: responsePayload.tenant_id,
            student_id: responsePayload.student_id,
        };
    }
    catch (error) {
        // Log del error
        logger.error('Error en la validación del token:', error);
        throw error; // Lanzar error para que el handler lo maneje
    }
};
exports.validateToken = validateToken;
//# sourceMappingURL=validateToken.js.map