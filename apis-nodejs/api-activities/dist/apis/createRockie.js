"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const validateToken_1 = require("../utils/validateToken"); // Ruta de validación del token
const uuid_1 = require("uuid");
// Crear una instancia del cliente DynamoDB v3
const dynamoDbClient = new client_dynamodb_1.DynamoDBClient({ region: 'us-east-1' });
const tableName = process.env.TABLE_NAME;
const handler = async (event) => {
    try {
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Falta el token de autorización' }),
            };
        }
        const { tenant_id, student_id } = await (0, validateToken_1.validateToken)(token);
        const body = JSON.parse(event.body || '{}');
        if (!body.rockie_name || !body.creation_date) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Datos incompletos' }),
            };
        }
        const newRockie = {
            tenant_id,
            rockie_id: (0, uuid_1.v4)(),
            student_id,
            rockie_name: body.rockie_name,
            creation_date: body.creation_date,
            additional_data: body.additional_data || {},
        };
        const params = {
            TableName: tableName,
            Item: newRockie,
        };
        // Crear un comando PutItemCommand
        // @ts-ignore
        const command = new client_dynamodb_1.PutItemCommand(params);
        // Ejecutar el comando en DynamoDB
        await dynamoDbClient.send(command);
        return {
            statusCode: 201,
            body: JSON.stringify(newRockie),
        };
    }
    catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error interno al crear el Rockie' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=createRockie.js.map