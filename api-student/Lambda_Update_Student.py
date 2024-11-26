import boto3
import logging
import os
from datetime import datetime
from decimal import Decimal

# Configurar el logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Helper para convertir Decimal a tipos JSON serializables
def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj

def lambda_handler(event, context):
    # Obtener el token de autorización desde los headers
    token = event['headers'].get('Authorization')
    if not token:
        return {
            'statusCode': 400,
            'body': 'Falta el token de autorización'
        }

    # Validar el token con DynamoDB
    dynamodb = boto3.resource('dynamodb')
    tokens_table = dynamodb.Table('t_access_tokens')

    token_response = tokens_table.get_item(
        Key={
            'token': token
        }
    )

    if 'Item' not in token_response:
        return {
            'statusCode': 403,
            'body': 'Token no existe'
        }

    # Verificar expiración del token
    expires = token_response['Item']['expires']
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    if now > expires:
        return {
            'statusCode': 403,
            'body': 'Token expirado'
        }

    tenant_id = token_response['Item']['tenant_id']
    student_id = token_response['Item']['student_id']

    if not tenant_id or not student_id:
        return {
            'statusCode': 500,
            'body': 'Faltan tenant_id o student_id en el token'
        }

    # Obtener datos del cuerpo del evento
    if 'body' in event:
        try:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        except json.JSONDecodeError:
            return {
                'statusCode': 400,
                'body': 'El cuerpo de la solicitud no es un JSON válido'
            }
    else:
        return {
            'statusCode': 400,
            'body': 'Falta el cuerpo de la solicitud'
        }

    # Actualizar los datos del estudiante en la tabla `t_students`
    t_students = dynamodb.Table('t_students')

    try:
        # Construir expresión de actualización
        update_expression = "SET "
        expression_attribute_values = {}

        for key, value in body.items():
            if key in ["student_name", "password", "birthday", "gender", "telephone", "rockie_coins", "rockie_gems"]:
                update_expression += f"student_data.{key} = :{key}, "
            else:
                update_expression += f"{key} = :{key}, "
            expression_attribute_values[f":{key}"] = value

        # Eliminar la última coma y el espacio
        update_expression = update_expression.rstrip(", ")

        # Realizar la actualización
        t_students.update_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values
        )

        # Obtener los datos completos del estudiante actualizado
        updated_student_response = t_students.get_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            }
        )

        if 'Item' not in updated_student_response:
            return {
                'statusCode': 500,
                'body': 'Error al obtener los datos actualizados del estudiante'
            }

        # Convertir los Decimals a tipos serializables
        student_data = convert_decimal(updated_student_response['Item'])

        # Devolver los datos actualizados
        return {
            'statusCode': 200,
            'body': student_data  # Sin json.dumps()
        }

    except Exception as e:
        logger.error(f"Error al actualizar los datos del estudiante: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error interno del servidor: {str(e)}"
        }
