import boto3
import os
from datetime import datetime
import logging

# Configuración de logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Obtener el stage desde las variables de entorno
stage = os.environ.get("STAGE", "dev")  # Default a "dev" si no se define

def lambda_handler(event, context):
    # Obtener el token desde la clave 'authorizationToken' en el evento
    token = event.get('authorizationToken', '')

    if not token:
        logger.error("Token no proporcionado")
        return {
            'statusCode': 403,
            'body': 'Token no proporcionado'
        }

    # Conexión a DynamoDB
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(f"{stage}_t_access_tokens")

    # Log para verificar la conexión a DynamoDB
    logger.info(f"Consultando en DynamoDB para el token: {token}")

    # Buscar el token en DynamoDB
    try:
        response = table.get_item(
            Key={'token': token}
        )

        if 'Item' not in response:
            logger.error(f"Token no existe en DynamoDB: {token}")
            return {
                'statusCode': 403,
                'body': 'Token no existe'
            }

        # Verificar si el token ha expirado
        expires = response['Item']['expires']
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        logger.info(f"Token encontrado. Fecha de expiración: {expires}, Fecha actual: {now}")

        if now > expires:
            logger.error("Token expirado")
            return {
                'statusCode': 403,
                'body': 'Token expirado'
            }

        # Obtener el tenant_id y student_id desde la tabla de tokens
        tenant_id = response['Item'].get('tenant_id', 'unknown')
        student_id = response['Item'].get('student_id', 'unknown')

        logger.info(f"Token válido. tenant_id: {tenant_id}, student_id: {student_id}")

        # Si el token es válido y no ha expirado
        return {
            'principalId': student_id,  # El identificador único del estudiante
            'policyDocument': {
                'Version': '2012-10-17',
                'Statement': [
                    {
                        'Action': 'execute-api:Invoke',
                        'Effect': 'Allow',
                        'Resource': event['methodArn']  # Permitir la invocación de la API
                    }
                ]
            },
            'context': {
                'tenantId': tenant_id,  # El ID del tenant
                'studentId': student_id,  # El ID del estudiante
                'expires': expires      # Fecha de expiración del token
            }
        }

    except Exception as e:
        # Manejar posibles errores y loguear el error completo
        logger.error(f"Error interno: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error interno: {str(e)}"
        }
