import * as AWS from 'aws-sdk';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../utils/validateToken';  // Asegúrate de que la ruta sea correcta

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
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
        const { tenant_id, student_id } = await validateToken(token);
        console.log(`Token validado: tenant_id = ${tenant_id}, student_id = ${student_id}`);

        const body = JSON.parse(event.body || '{}');

        // Verificar que se haya proporcionado el `rockie_id`
        if (!body.rockie_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Falta el campo rockie_id' }),
            };
        }

        // Obtener los detalles del Rockie desde la tabla de DynamoDB
        const getRockieResponse = await dynamoDb
            .get({
                TableName: tableName,
                Key: {
                    tenant_id,
                    rockie_id: body.rockie_id,  // Usamos `rockie_id` como clave primaria o secundaria
                },
            })
            .promise();

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
    } catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error interno al obtener el Rockie',
            }),
        };
    }
};