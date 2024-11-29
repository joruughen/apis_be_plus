const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
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
                body: { error: 'Missing Authorization token' }
            };
        }

        // Validar el token usando la función Lambda ValidateAccessToken
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
        if (!validateFunctionName) {
            return {
                statusCode: 500,
                body: { error: 'ValidateAccessToken function not configured' }
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
                body: { error: validatePayload.body || 'Unauthorized Access' }
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
                body: { error: 'Failed to retrieve tenant_id and student_id from token' }
            };
        }

        const tenantId = tokenItem.Item.tenant_id;
        const studentId = tokenItem.Item.student_id;

        if (!tenantId || !studentId) {
            return {
                statusCode: 500,
                body: { error: 'Missing tenant_id or student_id in token' }
            };
        }

        const { activity_id } = event.body;

        if (!activity_id) {
            return {
                statusCode: 400,
                body: { error: 'Missing activity_id in request body' }
            };
        }

        // Obtener el item de la actividad
        const activityParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id: activity_id}
        };

        // Verificar si la actividad existe
        const existingActivity = await docClient.send(new GetCommand(activityParams));

        if (!existingActivity.Item) {
            return {
                statusCode: 404,
                body: { error: 'Activity not found' }
            };
        }

        // Verificar si el student_id de la actividad coincide con el del token
        if (existingActivity.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: { error: 'Unauthorized: student_id does not match' }
            };
        }

        // Eliminar la actividad
        await docClient.send(new DeleteCommand({
            TableName: ACTIVITIES_TABLE,
            Key: activityParams.Key
        }));

        return {
            statusCode: 200,
            body: { message: 'Activity deleted successfully' }
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: { error: error.message }
        };
    }
};
