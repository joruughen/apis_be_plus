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

    # Validar el token y extraer el student_id y tenant_id
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
            'body': 'Forbidden - Acceso No Autorizado'
        }

    # Extraer el student_id y tenant_id desde la respuesta de validación
    student_id = response.get('student_id')
    tenant_id = response.get('tenant_id')

    if not student_id or not tenant_id:
        return {
            'statusCode': 500,
            'body': 'Error: Falta student_id o tenant_id en la respuesta de ValidateAccessToken'
        }

    # Conectar con DynamoDB y eliminar al estudiante
    dynamodb = boto3.resource('dynamodb')
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
