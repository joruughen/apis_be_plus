
import boto3
import os
import json

def lambda_handler(event, context):
    try:
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')
        updates = body.get('updates', {})

        if not tenant_id or not student_id or not updates:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing tenant_id, student_id, or updates'}
            }

        dynamodb = boto3.resource('dynamodb')
        stage = os.environ.get("STAGE", "dev")
        t_rockies = dynamodb.Table(f"{stage}_t_rockies")

        update_expression = "SET "
        expression_attribute_values = {}

        for key, value in updates.items():
            update_expression += f"{key} = :{key}, "
            expression_attribute_values[f":{key}"] = value

        update_expression = update_expression.rstrip(", ")

        t_rockies.update_item(
            Key={
                'tenant_id': tenant_id,
                'student_id': student_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values
        )

        return {
            'statusCode': 200,
            'body': {'message': 'Rockie updated successfully'}
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
