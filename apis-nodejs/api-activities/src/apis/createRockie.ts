import * as AWS from 'aws-sdk';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../utils/validateToken';  // Asegúrate de que la ruta sea correcta
import { v4 as uuidv4 } from 'uuid';

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

        // Verificar que los campos obligatorios estén presentes
        if (!body.rockie_name || !body.creation_date) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Datos incompletos' }),
            };
        }

        // Crear el nuevo Rockie
        const newRockie = {
            tenant_id,
            rockie_id: uuidv4(),
            student_id,
            rockie_name: body.rockie_name,
            creation_date: body.creation_date,
            additional_data: body.additional_data || {},
        };

        console.log('Nuevo Rockie:', newRockie);

        // Insertar el nuevo Rockie en DynamoDB
        await dynamoDb
            .put({
                TableName: tableName,
                Item: newRockie,
            })
            .promise();

        return {
            statusCode: 201,
            body: JSON.stringify(newRockie),
        };
    } catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error interno del servidor al crear el Rockie',
            }),
        };
    }
};
