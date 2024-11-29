const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Obtener la tabla de actividades desde las variables de entorno
const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;

exports.handler = async (event) => {
    try {
        // Obtener el body de la solicitud (no parseado)
        const body = event.body || '';

        // Extraer el activity_id del cuerpo (esperando que venga como un campo clave-valor en texto)
        const activityId = body.activity_id || null;

        // Imprimir el activity_id en los logs de CloudWatch
        console.log(`Received activity_id for delete: ${activityId}`);

        // Verificar si el activity_id existe
        if (!activityId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'activity_id is required in the body' })
            };
        }

        // Validar el token de autorización (esto debería ser parte de tu lógica de autenticación)
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Authorization token is missing' })
            };
        }

        // Aquí deberías agregar la lógica para validar el token usando otro servicio Lambda o validación
        // Por ahora asumimos que el token es válido

        // Eliminar la actividad de la base de datos
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { activity_id: activityId } // Usamos el activity_id para identificar la actividad a eliminar
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Activity ${activityId} deleted successfully` })
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
