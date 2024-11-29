import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { validateToken } from '../utils/validateToken'; // Ruta de validación del token
import { v4 as uuidv4 } from 'uuid';

// Crear una instancia del cliente DynamoDB v3
const dynamoDbClient = new DynamoDBClient({ region: 'us-east-1' });
const tableName = process.env.TABLE_NAME;

export const handler = async (event: any) => {
    try {
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Falta el token de autorización' }),
            };
        }

        const { tenant_id, student_id } = await validateToken(token);

        const body = JSON.parse(event.body || '{}');

        if (!body.rockie_name || !body.creation_date) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Datos incompletos' }),
            };
        }

        const newRockie = {
            tenant_id,
            rockie_id: uuidv4(),
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
        const command = new PutItemCommand(params);

        // Ejecutar el comando en DynamoDB
        await dynamoDbClient.send(command);

        return {
            statusCode: 201,
            body: JSON.stringify(newRockie),
        };
    } catch (error) {
        console.error('Error interno:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error interno al crear el Rockie' }),
        };
    }
};
