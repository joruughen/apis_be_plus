
import boto3
import hashlib
import os
from datetime import datetime

def lambda_handler(event, context):
    try:
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')
        rockie_name = body.get('rockie_name')
        evolution = body.get('evolution')

        if tenant_id and student_id and rockie_name:
            dynamodb = boto3.resource('dynamodb')
            stage = os.environ.get("STAGE", "dev")
            t_rockies = dynamodb.Table(f"{stage}_t_rockies")

            # Check if the rockie already exists
            existing_rockie = t_rockies.get_item(
                Key={
                    'tenant_id': tenant_id,
                    'student_id': student_id
                }
            )

            if 'Item' in existing_rockie:
                return {
                    'statusCode': 400,
                    'body': {'error': 'Rockie with this student_id already exists'}
                }

            creation_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # Set default adorned accessories
            default_adorned = {
                "head_accessory": "head_acc001",
                "arms_accessory": "arms_acc002",
                "body_accessory": "body_acc003",
                "face_accessory": "face_acc004",
                "background_accessory": "bg_acc005"
            }

            item = {
                'tenant_id': tenant_id,
                'student_id': student_id,
                'level': body.get('level', 1),
                'experience': body.get('experience', 0),
                'rockie_data': {
                    'rockie_name': rockie_name,
                    'rockie_adorned': default_adorned,
                    'rockie_all_accessories_ids': body.get('rockie_all_accessories_ids', []),
                    'evolution': evolution or 'Stage 1'
                },
                'creation_date': creation_date
            }

            t_rockies.put_item(Item=item)

            return {
                'statusCode': 200,
                'body': {'message': 'Rockie created successfully', 'rockie_name': rockie_name}
            }
        else:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing tenant_id, student_id, or rockie_name'}
            }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
