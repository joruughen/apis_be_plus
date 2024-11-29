const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Obtener la tabla de actividades desde las variables de entorno
const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;

exports.handler = async (event) => {
    try {
        // Obtener el body de la solicitud (no parseado)
        const body = event.body || '';

        // Extraer el tenant_id y activity_id del cuerpo
        const { tenant_id, activity_id } = body;  // Esperamos tenant_id y activity_id en el cuerpo

        // Imprimir los valores recibidos en los logs de CloudWatch
        console.log(`Received tenant_id: ${tenant_id}, activity_id for delete: ${activity_id}`);

        // Verificar si el activity_id o tenant_id están presentes
        if (!tenant_id || !activity_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'tenant_id and activity_id are required in the body' })
            };
        }

        // Validar el token de autorización
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Authorization token is missing' })
            };
        }

        // Aquí deberías agregar la lógica para validar el token usando otro servicio Lambda o validación
        // Por ahora asumimos que el token es válido

        // Verificar si la actividad existe en la base de datos
        const existingActivity = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id, activity_id }
        }));

        if (!existingActivity.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `Activity with tenant_id ${tenant_id} and activity_id ${activity_id} not found` })
            };
        }

        // Eliminar la actividad de la base de datos
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id, activity_id }
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Activity with tenant_id ${tenant_id} and activity_id ${activity_id} deleted successfully` })
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
