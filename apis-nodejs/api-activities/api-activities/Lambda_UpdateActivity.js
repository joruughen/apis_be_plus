const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Obtener la tabla de actividades desde las variables de entorno
const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;

exports.handler = async (event) => {
    try {
        // Obtener el body de la solicitud (no parseado)
        const body = event.body || '';

        // Extraer el tenant_id y activity_id del cuerpo
        const { tenant_id, activity_id, activity_data, activitie_type } = body;

        // Imprimir los valores recibidos en los logs de CloudWatch
        console.log(`Received tenant_id: ${tenant_id}, activity_id for update: ${activity_id}`);

        // Verificar si el tenant_id o activity_id están presentes
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

        // Actualizar la actividad en la base de datos
        const updateParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id, activity_id },
            UpdateExpression: "set activitie_type = :activitie_type, activity_data = :activity_data",
            ExpressionAttributeValues: {
                ":activitie_type": activitie_type || existingActivity.Item.activitie_type,
                ":activity_data": activity_data || existingActivity.Item.activity_data
            },
            ReturnValues: "UPDATED_NEW"
        };

        // Realizar la actualización
        const updatedActivity = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Activity with tenant_id ${tenant_id} and activity_id ${activity_id} updated successfully`,
                updatedAttributes: updatedActivity.Attributes
            })
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
