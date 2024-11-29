const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Obtén la tabla de actividades desde las variables de entorno
const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;

exports.handler = async (event) => {
    try {
        // Obtener el body de la solicitud
        const body = event.body ? JSON.parse(event.body) : {};

        // Obtener el activity_id del cuerpo
        const activityId = body.activity_id;

        // Imprimir el activity_id en los logs de CloudWatch
        console.log(`Received activity_id for update: ${activityId}`);

        // Verificar si el activity_id existe en el cuerpo
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

        // Verificar si la actividad existe en la base de datos
        const existingActivity = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { activity_id: activityId }
        }));

        if (!existingActivity.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `Activity with ID ${activityId} not found` })
            };
        }

        // Si la actividad existe, actualizamos los campos
        const updateData = body.activity_data || {};
        const updateParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { activity_id: activityId },
            UpdateExpression: "set activitie_type = :activitie_type, activity_data = :activity_data",
            ExpressionAttributeValues: {
                ":activitie_type": body.activitie_type || existingActivity.Item.activitie_type,
                ":activity_data": updateData
            },
            ReturnValues: "UPDATED_NEW"
        };

        // Actualizar la actividad en la base de datos
        const updatedActivity = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Activity ${activityId} updated successfully`,
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
