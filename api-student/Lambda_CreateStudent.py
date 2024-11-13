import boto3
import hashlib
from datetime import datetime

# Function to hash the password
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        # Check if `event['body']` is a JSON string and parse it if necessary
        body = event.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        # Retrieve required fields from the body
        tenant_id = body.get('tenant_id')
        student_id = body.get('student_id')
        student_email = body.get('student_email')
        password = body.get('password')

        # Check for required fields
        if tenant_id and student_id and student_email and password:
            # Connect to DynamoDB
            dynamodb = boto3.resource('dynamodb')
            t_students = dynamodb.Table('t_students')

            # Check if the student already exists by student_id
            existing_student = t_students.get_item(
                Key={
                    'tenant_id': tenant_id,
                    'student_id': student_id
                }
            )

            if 'Item' in existing_student:
                # If the student already exists by student_id, return an error
                return {
                    'statusCode': 400,
                    'body': {'error': 'Student with this student_id already exists'}
                }

            # Check if the student already exists by student_email using GSI
            response = t_students.query(
                IndexName='student_email_index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('student_email').eq(student_email) &
                                      boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id)
            )

            if response['Items']:
                # If a student with the same email already exists, return an error
                return {
                    'statusCode': 400,
                    'body': {'error': 'Student with this student_email already exists'}
                }

            # Hash the password
            hashed_password = hash_password(password)

            # Creation date
            creation_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # Main structure of the student data with `student_email` and `creation_date` at the top level
            item = {
                'tenant_id': tenant_id,
                'student_id': student_id,
                'student_email': student_email,  # Moved to top level
                'creation_date': creation_date,   # Moved to top level
                'student_data': {
                    'student_name': body.get('student_name', 'Unknown'),
                    'password': hashed_password,
                    'rockie_coins': body.get('rockie_coins', 0),
                    'rockie_gems': body.get('rockie_gems', 0)
                }
            }

            # Add optional fields to student_data if they are present in the body
            optional_fields = ['birthday', 'gender', 'telephone']
            for field in optional_fields:
                if body.get(field):
                    item['student_data'][field] = body.get(field)

            # Insert the record into the table
            t_students.put_item(Item=item)

            # Success response
            return {
                'statusCode': 200,
                'body': {'message': 'User registered successfully', 'student_email': student_email}
            }
        else:
            # Missing required fields
            return {
                'statusCode': 400,
                'body': {'error': 'Invalid request body: missing tenant_id, student_email, or password'}
            }

    except Exception as e:
        # Exception handling
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
