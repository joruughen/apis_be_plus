import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { validateToken } from "./utils/validateToken";

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Falta el token de autorización" }),
            };
        }

        const { tenant_id, student_id } = await validateToken(token);

        const result = await dynamoDb
            .query({
                TableName: tableName,
                KeyConditionExpression: "tenant_id = :tenant_id AND student_id = :student_id",
                ExpressionAttributeValues: {
                    ":tenant_id": tenant_id,
                    ":student_id": student_id,
                },
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify(result.Items || []),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: error.message === "Token inválido" ? 403 : 500,
            body: JSON.stringify({ message: error.message || "Error interno del servidor" }),
        };
    }
};
