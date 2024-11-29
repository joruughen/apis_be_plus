const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const express = require("express");
const serverless = require("serverless-http");

const app = express();

const ACTIVITIES_TABLE = `${process.env.STAGE}_t_activities`; // Utiliza la variable de entorno STAGE para definir el nombre de la tabla
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

app.use(express.json());

// Endpoint para crear una actividad
app.post("/activities", async (req, res) => {
  const { activityId, title, description, createdAt } = req.body;

  // Validación de los datos de entrada
  if (typeof activityId !== "string") {
    return res.status(400).json({ error: '"activityId" must be a string' });
  }
  if (typeof title !== "string") {
    return res.status(400).json({ error: '"title" must be a string' });
  }
  if (typeof description !== "string") {
    return res.status(400).json({ error: '"description" must be a string' });
  }
  if (typeof createdAt !== "string") {
    return res.status(400).json({ error: '"createdAt" must be a string' });
  }

  // Parámetros para insertar el nuevo item en la tabla DynamoDB
  const params = {
    TableName: ACTIVITIES_TABLE,
    Item: { activityId, title, description, createdAt },
  };

  try {
    const command = new PutCommand(params);
    await docClient.send(command);
    res.status(201).json({ activityId, title, description, createdAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create activity" });
  }
});

// Manejo de rutas no encontradas
app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

exports.handler = serverless(app);
