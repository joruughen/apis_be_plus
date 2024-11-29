const { LambdaClient } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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

        // Acceder directamente al body de la solicitud
        const body = event.body;  // El body ya está disponible, no lo parseamos

        const activity_id = body.activity_id;

        if (!activity_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing activity_id in request body' })
            };
        }

        // Verificar si la actividad existe para este tenant_id y activity_id
        const existingActivity = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activity_id }
        }));

        if (!existingActivity.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Activity not found for this tenant_id and activity_id' })
            };
        }

        // Verificar que el student_id de la actividad coincide con el student_id del token
        if (existingActivity.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Student ID mismatch, cannot delete this activity' })
            };
        }

        // Eliminar la actividad de la base de datos
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activity_id }
        }));

        // Responder con éxito
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Activity deleted successfully',
                activity_id: activity_id
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
