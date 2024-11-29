import * as AWS from 'aws-sdk';

const lambda = new AWS.Lambda();
const logger = require('lambda-log');

// Función que valida el token
export const validateToken = async (token: string) => {
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
        const responsePayload = JSON.parse(invokeResponse.Payload as string);
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
    } catch (error) {
        logger.error('Error en la validación del token:', error);
        throw error; // Lanzamos el error para que el handler lo maneje
    }
};
