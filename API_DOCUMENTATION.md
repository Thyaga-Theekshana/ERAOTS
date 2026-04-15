# Leave & Schedule API Documentation

## Updated Endpoints

### 1. Submit Leave Request
**POST** `/api/schedules/leave-requests`

**Request Body:**
```json
{
  "leave_type_id": "uuid-here",
  "start_date": "2026-04-20",
  "end_date": "2026-04-22",
  "reason": "Personal matter",
  "category": "NORMAL"  // NEW: NORMAL or EMERGENCY
}
```

**Response (200):**
```json
{
  "request_id": "uuid-here",
  "employee_id": "uuid-here",
  "employee_name": "John Doe",
  "leave_type_id": "uuid-here",
  "leave_type_name": "Annual Leave",
  "start_date": "2026-04-20",
  "end_date": "2026-04-22",
  "status": "PENDING",
  "category": "NORMAL",  // NEW
  "reason": "Personal matter",
  "review_comment": null,  // NEW
  "reviewed_by": null,  // NEW
  "reviewed_at": null,  // NEW
  "created_at": "2026-04-15T09:00:00Z"
}
```

---

### 2. Get My Leave Requests
**GET** `/api/schedules/leave-requests/my`

**Response (200):**
```json
[
  {
    "request_id": "uuid-here",
    "employee_id": "uuid-here",
    "employee_name": "John Doe",
    "leave_type_id": "uuid-here",
    "leave_type_name": "Annual Leave",
    "start_date": "2026-04-20",
    "end_date": "2026-04-22",
    "status": "APPROVED",
    "category": "NORMAL",
    "reason": "Personal matter",
    "review_comment": "Approved. Have a nice trip!",  // NEW: Admin feedback
    "reviewed_by": "uuid-of-admin",  // NEW
    "reviewed_at": "2026-04-15T10:30:00Z",  // NEW
    "created_at": "2026-04-15T09:00:00Z"
  }
]
```

---

### 3. List All Leave Requests (HR/Admin)
**GET** `/api/schedules/leave-requests?status=PENDING`

**Query Parameters:**
- `status` (optional): PENDING, APPROVED, REJECTED

**Response (200):** Array of LeaveRequestResponse objects (same as above)

**Notes:**
- Employees see only their own requests
- HR/Admins see all requests in system

---

### 4. Get Leave Calendar
**GET** `/api/schedules/leave-calendar?month=2026-04`

**Query Parameters:**
- `month` (optional): Format YYYY-MM (defaults to current month)

**Response (200):**
```json
[
  {
    "request_id": "uuid-here",
    "employee_id": "uuid-here",
    "employee_name": "John Doe",
    "leave_type_name": "Annual Leave",
    "start_date": "2026-04-20",
    "end_date": "2026-04-22",
    "status": "APPROVED"
  }
]
```

---

### 5. Approve/Reject Leave Request (HR/Admin Only)
**PUT** `/api/schedules/leave-requests/{request_id}/status`

**Query Parameters:**
- `status` (required): APPROVED or REJECTED
- `comment` (optional): Feedback message for employee

**Example:**
```
PUT /api/schedules/leave-requests/abc-123/status?status=APPROVED&comment=Approved%20for%20the%20dates
```

**Response (200):**
```json
{
  "message": "Leave request has been approved"
}
```

**Error Responses:**
- 403: Not authorized (not HR/Admin)
- 400: Invalid status or request not pending
- 404: Leave request not found

---

## Category Definitions

### NORMAL Leave
- **Approval Timeline**: Up to 1 week
- **Use Cases**: Vacation, planned personal days
- **Priority**: Standard
- **Color**: Blue

### EMERGENCY Leave
- **Approval Timeline**: 1-2 working days
- **Use Cases**: Urgent personal matters, emergencies
- **Priority**: High
- **Color**: Red

---

## Leave Types (Supported)

| Type | Max Days/Year | Paid | Requires Approval |
|------|---------------|------|-------------------|
| Annual Leave | 20 | Yes | Yes |
| Sick Leave | 14 | Yes | Yes |
| Emergency Leave | Unlimited | Yes | Yes |
| Unpaid Leave | Unlimited | No | Yes |
| Work From Home | Unlimited | Yes | Yes |

---

## Status Values

| Status | Meaning | Admin Action Required |
|--------|---------|----------------------|
| PENDING | Waiting for approval | Yes |
| APPROVED | Approved by HR/Admin | No |
| REJECTED | Rejected by HR/Admin | No |
| CANCELLED | Cancelled by employee | No |

---

## Error Handling

### 400 Bad Request
```json
{
  "detail": "Start date must be before end date"
}
```

### 400 Invalid Category
```json
{
  "detail": "Category must be NORMAL or EMERGENCY"
}
```

### 403 Forbidden
```json
{
  "detail": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "detail": "Leave request not found"
}
```

---

## Role-Based Access

### EMPLOYEE
- ✅ POST: Submit own leave request
- ✅ GET: View own leave requests only
- ✅ GET: View own leaves on calendar only
- ❌ PUT: Cannot approve/reject requests

### HR_MANAGER
- ✅ POST: Submit own leave request (if HR)
- ✅ GET: View all leave requests
- ✅ GET: View all leaves on calendar
- ✅ PUT: Approve/reject any request

### SUPER_ADMIN
- ✅ POST: Submit own leave request
- ✅ GET: View all leave requests
- ✅ GET: View all leaves on calendar
- ✅ PUT: Approve/reject any request

---

## Notification Format

When a leave request is approved/rejected, the employee receives:

```
Title: Leave Request APPROVED
Message: Your leave request from 2026-04-20 to 2026-04-22 was approved.
Comment: [Admin's comment if provided]
Type: LEAVE_UPDATE
```

---

## Example Workflow

### Step 1: Employee Submits Leave
```bash
POST /api/schedules/leave-requests
{
  "leave_type_id": "annual-uuid",
  "start_date": "2026-04-20",
  "end_date": "2026-04-22",
  "reason": "Spring vacation",
  "category": "NORMAL"
}
```

**Response**: `status: PENDING`

### Step 2: HR Sees Request
```bash
GET /api/schedules/leave-requests?status=PENDING
```

**Response**: List includes the new request

### Step 3: HR Approves with Comment
```bash
PUT /api/schedules/leave-requests/abc-123/status?status=APPROVED&comment=Enjoy%20your%20vacation
```

**Response**: Success message

### Step 4: Employee Gets Notification
- Notification sent to employee
- Status changed to APPROVED
- Comment visible in their leave request

### Step 5: Employee Views Request
```bash
GET /api/schedules/leave-requests/my
```

**Response**: 
```json
{
  ...
  "status": "APPROVED",
  "review_comment": "Enjoy your vacation",
  "reviewed_by": "admin-uuid",
  "reviewed_at": "2026-04-15T11:00:00Z"
}
```

---

## Performance Notes

- All endpoints use async/await for concurrency
- Eager loading of relationships for efficiency
- Indexed queries for fast retrieval
- Proper pagination ready for future implementation

---

## Migration Notes

### Database Schema Changes
```sql
-- Add to leave_requests table:
ALTER TABLE leave_requests ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE leave_requests ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;

-- These columns already exist but need to support NULL:
-- reviewed_by, review_comment (already nullable)
```

### No Breaking Changes
- All existing API responses still work
- New fields are additive only
- Backward compatible with old clients

---

## Testing Examples

### cURL Examples

**Submit Leave:**
```bash
curl -X POST http://localhost:8000/api/schedules/leave-requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leave_type_id": "type-uuid",
    "start_date": "2026-04-20",
    "end_date": "2026-04-22",
    "reason": "Vacation",
    "category": "NORMAL"
  }'
```

**Approve Leave:**
```bash
curl -X PUT "http://localhost:8000/api/schedules/leave-requests/request-uuid/status?status=APPROVED&comment=Approved" \
  -H "Authorization: Bearer HR_TOKEN"
```

**Get Calendar:**
```bash
curl -X GET "http://localhost:8000/api/schedules/leave-calendar?month=2026-04" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## What's New in This Version

✨ **category**: Leave urgency (NORMAL or EMERGENCY)
✨ **review_comment**: Admin feedback on decision
✨ **reviewed_by**: Who made the decision
✨ **reviewed_at**: When decision was made
✨ Enhanced PUT endpoint for approval with comments
✨ Full audit trail for leave requests
✨ Better role-based access control
