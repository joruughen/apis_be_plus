"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb"); // Importar DynamoDBClient y GetItemCommand
const validateToken_1 = require("../utils/validateToken"); // Asegúrate de que la ruta sea correcta
// Crear una instancia del cliente de DynamoDB v3
const dynamoDbClient = new client_dynamodb_1.DynamoDBClient({ region: 'us-east-1' }); // Asegúrate de usar la región correcta
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
        // Definir los parámetros de la consulta para obtener el Rockie desde DynamoDB
        const params = {
            TableName: tableName,
            Key: {
                tenant_id: { S: tenant_id }, // DynamoDB usa tipos como `S` para String
                rockie_id: { S: body.rockie_id }, // Asegúrate de que rockie_id sea del tipo correcto
            },
        };
        // Ejecutar el comando GetItemCommand con el cliente de DynamoDB
        const command = new client_dynamodb_1.GetItemCommand(params);
        const getRockieResponse = await dynamoDbClient.send(command);
        // Verificar si el Rockie existe en la tabla
        if (!getRockieResponse.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Rockie no encontrado' }),
            };
        }
        // Responder con los detalles del Rockie
        return {
            statusCode: 200,
            body: JSON.stringify(getRockieResponse.Item),
        };
    }
    catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error interno al obtener el Rockie',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=getRockie.js.map