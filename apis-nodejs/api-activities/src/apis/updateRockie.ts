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

        // Verificar que los campos necesarios estén presentes
        if (!body.rockie_id || !body.rockie_name || !body.creation_date) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Datos incompletos' }),
            };
        }

        // Verificar si el Rockie existe en la tabla
        const getRockieResponse = await dynamoDb
            .get({
                TableName: tableName,
                Key: {
                    tenant_id,
                    rockie_id: body.rockie_id,  // Usamos `rockie_id` como clave primaria o secundaria
                },
            })
            .promise();

        if (!getRockieResponse.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Rockie no encontrado' }),
            };
        }

        // Actualizar el "Rockie" en DynamoDB
        const updatedRockie = {
            tenant_id,
            rockie_id: body.rockie_id,
            student_id,
            rockie_name: body.rockie_name,
            creation_date: body.creation_date,
            additional_data: body.additional_data || {},
        };

        await dynamoDb
            .put({
                TableName: tableName,
                Item: updatedRockie,
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify(updatedRockie),
        };
    } catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error interno al actualizar el Rockie',
            }),
        };
    }
};
