# Leave & Schedule System - User Guide

## 👤 For Employees

### Requesting a Leave

1. **Navigate to Schedules & Leave Page**
   - From sidebar menu, click "Schedules & Leave"

2. **Click the FAB Button** (Floating Action Button)
   - Large "+" button in the bottom-right corner
   - Opens "Request Leave" modal

3. **Select Leave Category**
   - **NORMAL**: Standard leave (approval takes up to 1 week)
   - **EMERGENCY**: Urgent leave (approval within 1-2 working days)

4. **Choose Leave Type**
   - Annual Leave
   - Sick Leave
   - Emergency Leave
   - Unpaid Leave
   - Work From Home
   - (Or any configured by HR)

5. **Select Dates**
   - Click "Start Date" and pick when leave begins
   - Click "End Date" and pick when leave ends
   - End date must be after start date

6. **Add Reason**
   - Explain why you need leave
   - This helps HR make a quick decision
   - Be clear and concise

7. **Submit**
   - Click "Submit Request"
   - See success notification
   - Request moves to Pending status

### Viewing Your Leave Requests

**Table View** (Default):
- Shows all your leave requests
- See status: PENDING, APPROVED, REJECTED
- See leave type and dates
- If approved/rejected, see admin comments

**Calendar View**:
- Click calendar icon to switch views
- Visual calendar showing your approved leaves
- Color-coded by status
- Navigate months with arrow buttons

### Checking Leave Balance

- Leave usage cards at top of page show:
  - Used days (this year)
  - Remaining days
  - Warnings if approaching limit

### Getting Approved/Rejected

When HR approves or rejects your leave:
- You get a notification
- Check your leave request in the table
- If rejected, admin's feedback comment appears
- Request status shows: ✅ APPROVED or ❌ REJECTED

---

## 👨‍💼 For Admins/HR

### Viewing Leave Requests

1. **Navigate to Schedules & Leave Page**
   - From sidebar menu, click "Schedules & Leave"

2. **You see ALL employee leave requests**
   - Employees only see their own
   - You see everyone's

3. **Table shows:**
   - Employee Name
   - Leave Type (Annual, Sick, etc.)
   - Category (NORMAL/EMERGENCY) - color-coded
   - Duration (Start → End dates)
   - Reason/Comments
   - Status (PENDING/APPROVED/REJECTED)
   - Comment indicator if you left feedback

### Filtering Requests

- Use status dropdown if available
- Quick look at stats: Total, Pending, Approved, Rejected

### Approving/Rejecting Leaves

1. **Find the Request**
   - Scan table for PENDING status
   - Priority: RED (EMERGENCY) over BLUE (NORMAL)

2. **Click Action Button**
   - Green checkmark = Approve
   - Red X = Reject
   - Opens approval modal

3. **Review Details**
   - Employee name
   - Leave type
   - Duration dates
   - Original reason

4. **Add Optional Comment**
   - Provide feedback if rejecting
   - Or congratulations message if approving
   - Employee will see this

5. **Make Decision**
   - Click "Approve Request" (green) or "Reject Request" (red)
   - Decision saves
   - Employee gets notification

### Using Calendar View

- Switch to calendar tab
- See all approved and pending leaves visually
- Easy to spot coverage gaps
- Shows employee names
- Navigate months with arrows

### Viewing Statistics

- Dashboard shows:
  - Total requests
  - Pending (need attention)
  - Approved (confirmed)
  - Rejected (denied)
- Leave balance summaries
- Usage warnings

### Leave Balance Management

- See used vs remaining per leave type
- Warnings for:
  - Near Limit (80%+)
  - Exceeded (over 100%)

---

## 📋 Leave Types Explained

| Type | Typical Days | Notes |
|------|-------------|-------|
| **Annual Leave** | 20/year | Vacation, personal days |
| **Sick Leave** | 14/year | Medical appointments, illness |
| **Emergency Leave** | Unlimited | Urgent situations, family emergencies |
| **Unpaid Leave** | Unlimited | Unpaid time off |
| **Work From Home** | Unlimited | Remote work days |

---

## 🎯 Leave Categories

### NORMAL Leave 🔵 (Blue)
- **Approval time**: Up to 1 week
- **When to use**: Planned vacation, personal days, regular leave
- **Priority**: Standard
- **Example**: "I'd like to take leave April 20-22 for vacation"

### EMERGENCY Leave 🔴 (Red)
- **Approval time**: 1-2 working days
- **When to use**: Urgent personal matters, emergencies
- **Priority**: High (gets reviewed first)
- **Example**: "Family emergency, need leave today and tomorrow"

---

## ⏱️ Timeline

### Employee Submits Leave
- Request created
- Status: **PENDING**
- HR notified

### HR Reviews Request
- Typically within 1 week for NORMAL
- Typically within 1-2 days for EMERGENCY
- No action needed by employee

### HR Approves/Rejects
- Adds optional comment
- Clicks decision button
- Employee notified immediately

### Employee Sees Result
- Notification received
- Leave appears as APPROVED or REJECTED
- Comments visible if any

---

## 💬 What to Include in Your Request

**Good Request:**
```
Type: Annual Leave
Dates: April 20-22, 2026 (3 days)
Category: NORMAL
Reason: Spring vacation with family
```

**Better Request:**
```
Type: Sick Leave
Dates: April 15, 2026 (1 day)
Category: NORMAL
Reason: Doctor's appointment (preventive checkup)
```

---

## 🔔 Notifications

You'll receive notifications for:

✅ **Leave Approved**
- Your leave request for [dates] was APPROVED
- Admin comment: [if provided]

❌ **Leave Rejected**
- Your leave request for [dates] was REJECTED
- Reason: [admin comment]

📧 **Notifications appear in:**
- In-app notification center
- Email (if configured)
- Push notifications (mobile)

---

## 🛠️ Troubleshooting

### Can't Submit Leave?
- Check all fields are filled
- Start date must be before end date
- Try refreshing the page

### Leave shows but I can't see it?
- Refresh the page
- Check if it's in calendar view
- Try switching views

### Don't see notification?
- Check notification center (bell icon)
- Check spam folder for emails
- Admin may still be reviewing

### Can't edit leave?
- Only pending requests can be updated (via HR)
- If pending too long, contact HR directly
- For approved/rejected, can't change

### Category won't change?
- Make sure you click the button to toggle
- NORMAL is default
- EMERGENCY for urgent matters only

---

## 📞 Support & Help

### For Employees:
- Contact HR Manager
- Check leave balance in dashboard
- Review approval timeline

### For Admins:
- Review API documentation in repository
- Check error messages in browser console
- Check backend logs for issues

---

## ⚠️ Important Notes

1. **Once submitted, requests can't be edited**
   - Contact HR if you need to cancel

2. **Leave approval follows legal requirements**
   - Depends on your company policy
   - Admins apply company leave policies

3. **Calendar shows approved and pending only**
   - Rejected leaves don't show on calendar
   - Check table view for full status

4. **Leave balance resets** (typically)
   - Usually annually
   - Depends on company policy

5. **Emergency leave may require documentation**
   - Plan to provide proof if requested
   - Contact HR if needed

---

## 🎓 Best Practices

✅ **DO:**
- Request leave in advance when possible
- Use NORMAL category for planned leave
- Use EMERGENCY only for actual emergencies
- Provide clear reason
- Check your leave balance before requesting

❌ **DON'T:**
- Abuse emergency category for convenience
- Request leave without reason
- Ignore admin comments
- Forget about approve/pending leaves
- Ignore company leave policies

---

## 📱 Mobile/Responsive

- All features work on mobile
- Use TABLE view for detailed info
- Use CALENDAR view for visual planning
- Full functionality preserved

---

## 🔐 Privacy & Security

- Only you can see your leave requests
- Admins see all employees' leaves (for coverage planning)
- Timestamps tracked for audit
- Comments visible only to relevant parties

---

## ✨ Tips & Tricks

- Star calendar view during planning season
- Use EMERGENCY category strategically
- Add detailed reasons for faster approval
- Check balance before big requests
- Plan ahead during busy seasons

---

## Version Info

- **Current Version**: 1.0
- **Last Updated**: April 15, 2026
- **Status**: Production Ready

---

For detailed API documentation, see: `API_DOCUMENTATION.md`
For technical details, see: `FILE_CHANGES.md`
For feature overview, see: `LEAVE_SCHEDULE_IMPROVEMENTS.md`
