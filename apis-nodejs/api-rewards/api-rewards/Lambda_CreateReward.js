const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

// Crear clientes para DynamoDB y Lambda usando la versión modular
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const REWARDS_TABLE = $`{process.env.STAGE}_t_rewards`;
const TOKENS_TABLE = $`{process.env.STAGE}_t_access_tokens`;

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

        // Recuperar tenant_id desde el token
        const tokenItem = await docClient.send(new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { token }
        }));

        if (!tokenItem.Item) {
            return {
                statusCode: 500,
                body: { error: 'Failed to retrieve tenant_id from token' }
            };
        }

        const tenantId = tokenItem.Item.tenant_id;

        if (!tenantId) {
            return {
                statusCode: 500,
                body: { error: 'Missing tenant_id in token' }
            };
        }

        // Validar los datos del body
        const body = event.body || {};
        const { reward_name, student_id, experience, activity_id } = body;

        if (!reward_name || !student_id || experience === undefined) {
            return {
                statusCode: 400,
                body: { error: 'Missing required fields: reward_name, student_id, or experience' }
            };
        }

        // Generar un UUID para el nuevo reward_id
        const rewardId = uuidv4();

        // Crear el objeto de la recompensa
        const creationDate = moment().format('YYYY-MM-DD HH:mm:ss');
        const newRewardItem = {
            tenant_id: tenantId,
            reward_id: rewardId,
            student_id,
            experience,
            activity_id: activity_id || null, // Opcional
            reward_name,
            creation_date: creationDate
        };

        // Verificar si la recompensa ya existe
        const existingReward = await docClient.send(new GetCommand({
            TableName: REWARDS_TABLE,
            Key: { tenant_id: tenantId, reward_id: rewardId }
        }));

        if (existingReward.Item) {
            return {
                statusCode: 400,
                body: { error: 'Reward already exists for this tenant_id and reward_id' }
            };
        }

        // Insertar la nueva recompensa en DynamoDB
        await docClient.send(new PutCommand({
            TableName: REWARDS_TABLE,
            Item: newRewardItem
        }));

        return {
            statusCode: 200,
            body: {
                message: 'Reward created successfully',
                reward: newRewardItem
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