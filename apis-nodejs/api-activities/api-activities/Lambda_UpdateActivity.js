const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const moment = require('moment');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`;
const TOKENS_TABLE = `${process.env.STAGE}_t_access_tokens`;

exports.handler = async (event, context) => {
    try {
        // Obtener el token de autorización desde los headers
        const token = event.headers['Authorization'];
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing Authorization token' })
            };
        }

        // Validar el token usando la función Lambda ValidateAccessToken
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        if (!validateFunctionName) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'ValidateAccessToken function not configured' })
            };
        }

        const validateResponse = await lambdaClient.send(new InvokeCommand({
            FunctionName: validateFunctionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ token })
        }));

        const validatePayload = JSON.parse(Buffer.from(validateResponse.Payload).toString());
        if (validatePayload.statusCode === 403) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: validatePayload.body || 'Unauthorized Access' })
            };
        }

        // Recuperar tenant_id y student_id desde el token
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token }
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to retrieve tenant_id and student_id from token' })
            };
        }

        const tenantId = tokenItem.Item.tenant_id;
        const studentId = tokenItem.Item.student_id;

        if (!tenantId || !studentId) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Missing tenant_id or student_id in token' })
            };
        }

        // Obtener el `activity_id` de los parámetros de la ruta (URL)
        const activityId = event.pathParameters.activity_id; // Aquí se obtiene del path

        if (!activityId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing activity_id in path parameters' })
            };
        }

        // Obtener los datos del body
        const body = JSON.parse(event.body || '{}');
        const { activitie_type, activity_data } = body;

        if (!activitie_type) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing activitie_type in request body' })
            };
        }

        // Verificar si la actividad existe
        const activityParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activityId, student_id: studentId }
        };

        const existingActivity = await docClient.send(new GetCommand(activityParams));

        if (!existingActivity.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Activity not found' })
            };
        }

        // Verificar si el student_id de la actividad coincide con el del token
        if (existingActivity.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Unauthorized: student_id does not match' })
            };
        }

        // Actualizar los campos de la actividad (excepto `activity_id` que no debe ser modificado)
        const updateParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activityId, student_id: studentId },
            UpdateExpression: 'set activitie_type = :activitie_type, activity_data = :activity_data, #updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':activitie_type': activitie_type,
                ':activity_data': activity_data || existingActivity.Item.activity_data, // Usar valores nuevos si están presentes, o los existentes
                ':updatedAt': moment().format('YYYY-MM-DD HH:mm:ss')
            },
            ExpressionAttributeNames: {
                '#updatedAt': 'updated_at' // Asegúrate de tener un campo `updated_at` para las actualizaciones
            },
            ReturnValues: 'ALL_NEW'
        };

        const updatedActivity = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Activity updated successfully',
                activity: updatedActivity.Attributes
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
