import boto3
import json
import logging
import os

# Configurar el logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    # Obtener el token de autorización desde los headers
    token = event['headers'].get('Authorization')
    if not token:
        return {
            'statusCode': 400,
            'body': 'Falta el token de autorización'
        }

    # Obtener el nombre de la función de validación desde la variable de entorno
    validate_function_name = os.environ.get('VALIDATE_FUNCTION_NAME')
    if not validate_function_name:
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor: falta configuración de la función de validación'
        }

    # Invocar la función Lambda ValidateAccessToken para validar el token
    lambda_client = boto3.client('lambda')
    payload_string = {"token": token}
    invoke_response = lambda_client.invoke(
        FunctionName=validate_function_name,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload_string)
    )

    # Leer y cargar la respuesta de la invocación
    response_payload = json.loads(invoke_response['Payload'].read())
    logger.info("Response from ValidateAccessToken: %s", response_payload)

    # Verificar si el token es válido
    if response_payload.get('statusCode') == 403:
        return {
            'statusCode': 403,
            'body': response_payload.get('body', 'Acceso No Autorizado')
        }

    # Extraer tenant_id y student_id desde la tabla de tokens
    dynamodb = boto3.resource('dynamodb')
    tokens_table = dynamodb.Table('t_access_tokens')
    token_response = tokens_table.get_item(
        Key={
            'token': token
        }
    )

    if 'Item' not in token_response:
        return {
            'statusCode': 500,
            'body': 'Error al obtener el tenant_id y student_id del token'
        }

    tenant_id = token_response['Item'].get('tenant_id')
    student_id = token_response['Item'].get('student_id')

    if not tenant_id or not student_id:
        return {
            'statusCode': 500,
            'body': 'Error: Falta tenant_id o student_id en el token almacenado'
        }

    # Conectar con DynamoDB y eliminar al estudiante
    t_students = dynamodb.Table('t_students')

    try:
        db_response = t_students.delete_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        return {
            'statusCode': 200,
            'body': 'Estudiante eliminado exitosamente'
        }

    except Exception as e:
        logger.error(f"Error al eliminar el estudiante desde DynamoDB: {e}")
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor'
        }
