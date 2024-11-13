import boto3
import hashlib
import json
import uuid
from datetime import datetime, timedelta
from boto3.dynamodb.conditions import Key

# Function to hash the password
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        # Check if 'body' is a JSON string and parse it if necessary
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        # Retrieve required fields from the body
        tenant_id = body.get('tenant_id')
        student_email = body.get('student_email')
        password = body.get('password')

        # Check for missing fields
        if not (tenant_id and student_email and password):
            return {
                'statusCode': 400,
                'body': 'Invalid request: missing tenant_id, student_email, or password'
            }

        # Hash the password to compare with stored hash
        hashed_password = hash_password(password)
        dynamodb = boto3.resource('dynamodb')
        t_students = dynamodb.Table('t_students')

        # Query the GSI to find the student by email
        response = t_students.query(
            IndexName='student_email_index',
            KeyConditionExpression=Key('student_email').eq(student_email) & Key('tenant_id').eq(tenant_id)
        )

        # Check if the student exists
        if not response['Items']:
            return {
                'statusCode': 403,
                'body': 'User does not exist'
            }

        # Verify password
        student_data = response['Items'][0]
        if hashed_password != student_data['student_data']['password']:
            return {
                'statusCode': 403,
                'body': 'Incorrect password'
            }

        # Generate a session token
        token = str(uuid.uuid4())
        expiration_time = datetime.now() + timedelta(hours=1)
        token_data = {
            'token': token,
            'student_id': student_data['student_id'],
            'tenant_id': tenant_id,  # Add tenant_id to the token data
            'expires': expiration_time.strftime('%Y-%m-%d %H:%M:%S')
        }

        # Store the token in the t_access_tokens table
        t_tokens = dynamodb.Table('t_access_tokens')
        t_tokens.put_item(Item=token_data)

        # Return a success message with the token
        return {
            'statusCode': 200,
            'body': {
                'message': 'Login successful',
                'token': token
            }
        }

    except json.JSONDecodeError:
        # Handle JSON parsing errors
        return {
            'statusCode': 400,
            'body': {'error': 'Invalid JSON format in request body'}
        }
    except Exception as e:
        # General error handling
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
