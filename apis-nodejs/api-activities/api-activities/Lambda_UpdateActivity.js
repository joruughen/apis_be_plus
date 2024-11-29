const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

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

        // Validar el token
        const validateFunctionName = process.env.VALIDATE_FUNCTION_NAME;
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

        // Recuperar tenant_id y student_id del token
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

        // Obtener el activity_id desde los parámetros del path
        const { activity_id, activity_type, activity_data } = event.body;

        if (!activity_id) {
            return {
                statusCode: 400,
                body: { error: 'Missing activity_id in request body' }
            };
        }

        // Buscar la actividad en la base de datos
        const activity = await docClient.send(new GetCommand({
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id }
        }));

        if (!activity.Item) {
            return {
                statusCode: 404,
                body: { error: 'Activity not found' }
            };
        }

        // Verificar que el student_id de la actividad coincida con el del token
        if (activity.Item.student_id !== studentId) {
            return {
                statusCode: 403,
                body: { error: 'Activity student_id does not match token student_id' }
            };
        }

        // Actualizar los datos de la actividad
        const updatedActivity = {
            ...activity.Item,
            activity_type: activity_type || activity.Item.activity_type,
            activity_data: activity_data || activity.Item.activity_data,
        };

        const updateParams = {
            TableName: ACTIVITIES_TABLE,
            Key: { tenant_id: tenantId, activity_id },
            UpdateExpression: 'SET activity_type = :activity_type, activity_data = :activity_data',
            ExpressionAttributeValues: {
                ':activity_type': updatedActivity.activity_type,
                ':activity_data': updatedActivity.activity_data
            },
            ReturnValues: 'ALL_NEW'
        };

        const updatedItem = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: {
                message: 'Activity updated successfully',
                activity: updatedItem.Attributes
            }
        };

    } catch (error) {
        console.error('Error occurred:', error);
        return {
            statusCode: 500,
            body: { error: error.message }
        };
    }
};
