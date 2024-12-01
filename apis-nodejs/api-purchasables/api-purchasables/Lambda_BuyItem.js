const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB Client
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const stage = process.env.STAGE || 'dev';
    const body = JSON.parse(event.body || '{}');
    const { accountId, itemId } = body;

    if (!accountId || !itemId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'accountId and itemId are required.' }),
        };
    }

    try {
        // Fetch Account
        const accountParams = {
            TableName: `${stage}_accounts`,
            Key: { id: accountId },
        };
        const accountResult = await docClient.send(new GetCommand(accountParams));
        const account = accountResult.Item;

        if (!account) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Account not found.' }),
            };
        }

        // Fetch Item (now with additional dynamic fields like tenant_id, activity_data, etc.)
        const itemParams = {
            TableName: `${stage}_purchasables`,
            Key: { id: itemId },
        };
        const itemResult = await docClient.send(new GetCommand(itemParams));
        const item = itemResult.Item;

        if (!item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Item not found.' }),
            };
        }

        if (item.stock <= 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Item out of stock.' }),
            };
        }

        if (account.balance < item.price) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Insufficient balance.' }),
            };
        }

        // Log the details of the purchase request
        console.log('Processing purchase for account:', accountId);
        console.log('Item being purchased:', JSON.stringify(item, null, 2));

        // Deduct Price from Account Balance
        const updatedBalance = account.balance - item.price;
        const updateAccountParams = {
            TableName: `${stage}_accounts`,
            Key: { id: accountId },
            UpdateExpression: 'SET balance = :balance',
            ExpressionAttributeValues: {
                ':balance': updatedBalance,
            },
        };
        await docClient.send(new UpdateCommand(updateAccountParams));

        // Reduce Stock of the Item
        const updatedStock = item.stock - 1;
        const updateItemParams = {
            TableName: `${stage}_purchasables`,
            Key: { id: itemId },
            UpdateExpression: 'SET stock = :stock',
            ExpressionAttributeValues: {
                ':stock': updatedStock,
            },
        };
        await docClient.send(new UpdateCommand(updateItemParams));

        // Log Transaction
        const transaction = {
            id: uuidv4(),
            accountId,
            itemId,
            amount: item.price,
            timestamp: new Date().toISOString(),
            tenant_id: item.tenant_id,       // Add tenant_id from item
            activity_id: item.activity_id,   // Add activity_id from item (if relevant)
            activity_data: item.activity_data, // Add activity_data from item (if relevant)
        };

        // Log the transaction details for debugging
        console.log('Transaction details:', JSON.stringify(transaction, null, 2));

        const transactionParams = {
            TableName: `${stage}_transactions`,
            Item: transaction,
        };
        await docClient.send(new PutCommand(transactionParams));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Purchase successful', transaction }),
        };
    } catch (error) {
        console.error('Error processing purchase:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

