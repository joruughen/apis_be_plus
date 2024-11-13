import boto3
import hashlib
import json
from datetime import datetime

# Hash password
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# Function to handle user registration and password validation
def lambda_handler(event, context):
    try:
        # Check if `event['body']` is a JSON string and convert it to a dictionary if needed
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        # Get required fields from the request body
        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')
        student_email = body.get('student_email')
        password = body.get('password')

        # Verify that required fields are present
        if tenant_id and student_id and student_email and password:
            # Connect to DynamoDB
            dynamodb = boto3.resource('dynamodb')
            t_students = dynamodb.Table('t_students')

            # Check if the student already exists
            existing_student = t_students.get_item(
                Key={
                    'tenant_id': tenant_id,
                    'student_id': student_id
                }
            )

            if 'Item' in existing_student:
                # If the student already exists, return an error
                message = {
                    'error': 'Student with this student_id already exists'
                }
                return {
                    'statusCode': 400,
                    'body': message
                }

            # Hash the password
            hashed_password = hash_password(password)

            # Creation date
            creation_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # Main structure for student data
            item = {
                'tenant_id': tenant_id,
                'student_id': student_id,
                'student_data': {
                    'creation_date': creation_date,
                    'student_name': body.get('student_name', 'Unknown'),  # Default to 'Unknown' if not provided
                    'student_email': student_email,
                    'password': hashed_password,
                    'rockie_coins': body.get('rockie_coins', 0),  # Default to 0 if not provided
                    'rockie_gems': body.get('rockie_gems', 0)    # Default to 0 if not provided
                }
            }

            # Add optional fields
            optional_fields = ['birthday', 'gender', 'telephone']
            for field in optional_fields:
                if body.get(field):
                    item['student_data'][field] = body.get(field)

            # Insert the record into the table
            t_students.put_item(Item=item)

            # Success response
            message = {
                'message': 'User registered successfully',
                'student_email': student_email
            }
            return {
                'statusCode': 200,
                'body': message
            }
        else:
            # Missing required fields
            message = {
                'error': 'Invalid request body: missing tenant_id, student_email, or password'
            }
            return {
                'statusCode': 400,
                'body': message
            }

    except Exception as e:
        # Exception handling
        print("Exception:", str(e))
        message = {
            'error': str(e)
        }
        return {
            'statusCode': 500,
            'body': message
        }
