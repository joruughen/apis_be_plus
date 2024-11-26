import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
t_rockies = dynamodb.Table('t_rockies')

def lambda_handler(event, context):
    try:
        # Parsear el cuerpo del evento
        body = json.loads(event['body'])

        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')
        rockie_data = body.get('rockie_data', {})

        # Validar campos requeridos
        if not tenant_id or not student_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'tenant_id y student_id son requeridos'})
            }

        # Verificar si ya existe un rockie para el estudiante
        existing_rockie = t_rockies.get_item(Key={'tenant_id': tenant_id, 'student_id': student_id})
        if 'Item' in existing_rockie:
            return {
                'statusCode': 409,
                'body': json.dumps({'error': 'Ya existe un rockie para este student_id'})
            }

        # Configurar valores por defecto
        rockie_name = rockie_data.get('rockie_name', 'DefaultRockie')
        experience = rockie_data.get('experience', 0)
        level = rockie_data.get('level', 1)
        evolution = rockie_data.get('evolution', 'Stage 0')

        # Valores por defecto para adornos y accesorios
        rockie_adorned = {
            'head_accessory': None,
            'arms_accessory': None,
            'body_accessory': None,
            'face_accessory': None,
            'background_accessory': None
        }
        rockie_all_accessories_ids = []

        # Crear el objeto Rockie
        rockie_item = {
            'tenant_id': tenant_id,
            'student_id': student_id,
            'rockie_data': {
                'rockie_name': rockie_name,
                'experience': experience,
                'level': level,
                'evolution': evolution,
                'rockie_adorned': rockie_adorned,
                'rockie_all_accessories_ids': rockie_all_accessories_ids
            }
        }

        # Insertar el objeto en DynamoDB
        t_rockies.put_item(Item=rockie_item)

        return {
            'statusCode': 201,
            'body': json.dumps({'message': 'Rockie creado exitosamente', 'rockie_name': rockie_name})
        }

    except Exception as e:
        logger.error(f"Error al crear el Rockie: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Error interno al crear el Rockie'})
        }
