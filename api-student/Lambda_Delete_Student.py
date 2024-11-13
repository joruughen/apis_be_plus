import boto3
import json
import os

def lambda_handler(event, context):
    # Obtener token de autorización
    token = event['headers'].get('Authorization')
    if not token:
        return {
            'statusCode': 400,
            'body': 'Falta el token de autorización'
        }

    # Obtener el nombre de la función de validación desde las variables de entorno
    validate_function_name = os.environ.get("VALIDATE_FUNCTION_NAME", "DefaultValidateFunctionName")

    # Validar el token
    lambda_client = boto3.client('lambda')
    payload_string = json.dumps({"token": token})
    invoke_response = lambda_client.invoke(
        FunctionName=validate_function_name,
        InvocationType='RequestResponse',
        Payload=payload_string
    )
    response = json.loads(invoke_response['Payload'].read())

    # Verificar si el token es válido
    if response.get('statusCode') == 403:
        return {
            'statusCode': 403,
            'body': response.get('body', 'Acceso No Autorizado')
        }

    # Ahora que el token es válido, extraemos `tenant_id` y `student_id` desde la tabla `t_access_tokens`
    dynamodb = boto3.resource('dynamodb')
    tokens_table = dynamodb.Table('t_access_tokens')
    token_response = tokens_table.get_item(
        Key={
            'token': token
        }
    )

    # Verificar si se obtuvieron los datos correctamente
    if 'Item' not in token_response:
        return {
            'statusCode': 500,
            'body': 'Error al obtener el tenant_id y student_id del token'
        }

    tenant_id = token_response['Item'].get('tenant_id')
    student_id = token_response['Item'].get('student_id')

    # Verificar que ambos valores estén presentes
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

        # Responder con confirmación de eliminación
        return {
            'statusCode': 200,
            'body': 'Estudiante eliminado exitosamente'
        }

    except Exception as e:
        print(f"Error al eliminar el estudiante: {e}")
        return {
            'statusCode': 500,
            'body': 'Error interno del servidor'
        }
