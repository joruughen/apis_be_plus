import boto3
import os
from datetime import datetime

# Obtener el stage desde las variables de entorno
stage = os.environ.get("STAGE", "dev")  # Default a "dev" si no se define

def lambda_handler(event, context):
    # Entrada (json)
    token = event['token']
    # Proceso
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(f"{stage}_t_access_tokens")
    response = table.get_item(
        Key={
            'token': token
        }
    )
    if 'Item' not in response:
        return {
            'statusCode': 403,
            'body': 'Token no existe'
        }
    else:
        expires = response['Item']['expires']
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if now > expires:
            return {
                'statusCode': 403,
                'body': 'Token expirado'
            }
    
    # Salida (json)
    return {
        'statusCode': 200,
        'body': 'Token válido'
    }
