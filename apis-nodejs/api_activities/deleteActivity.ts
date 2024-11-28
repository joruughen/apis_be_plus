import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { validateToken } from "./utils/validateToken";

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Obtener el token del header
        const token = event.headers.Authorization;
        if (!token) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Falta el token de autorización" }),
            };
        }

        // Validar el token usando Lambda ValidateAccessToken
        const { tenant_id } = await validateToken(token);

        // Obtener parámetros de la solicitud
        const body = JSON.parse(event.body || "{}");
        const { activity_id } = body;

        if (!activity_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Falta el parámetro activity_id" }),
            };
        }

        // Verificar si la actividad existe
        const result = await dynamoDb
            .get({
                TableName: tableName,
                Key: { tenant_id, activity_id },
            })
            .promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "La actividad no existe" }),
            };
        }

        // Eliminar la actividad
        await dynamoDb
            .delete({
                TableName: tableName,
                Key: { tenant_id, activity_id },
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Actividad eliminada con éxito" }),
        };
    } catch (error) {
        console.error("Error al eliminar la actividad:", error);
        return {
            statusCode: error.message === "Token inválido" ? 403 : 500,
            body: JSON.stringify({ message: error.message || "Error interno del servidor" }),
        };
    }
};
