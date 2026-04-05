# Software Requirements Specification (SRS)

## Enterprise Real-Time Attendance & Occupancy Tracking System

| Field | Detail |
|-------|--------|
| **Document Type** | Software Requirements Specification (IEEE 830) |
| **Version** | 1.0 |
| **Date** | April 5, 2026 |
| **Status** | Draft |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [System Features Detail](#5-system-features-detail)
6. [Data Requirements](#6-data-requirements)
7. [Appendices](#7-appendices)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for the **Enterprise Real-Time Attendance & Occupancy Tracking System (ERAOTS)**. It serves as a comprehensive reference for the development team and stakeholders, defining all functional and non-functional requirements, system constraints, and data models.

This SRS targets the following audiences:
- Development team (11 members across 4 squads)
- Company stakeholders and evaluators
- QA/testing personnel

### 1.2 Scope

ERAOTS is a full-stack web application that transforms raw biometric door-access events into actionable workforce intelligence. The system moves beyond traditional "clock-in/clock-out" attendance by providing:

- **Real-time occupancy visibility** — Know who is in the building right now
- **Intelligent attendance analytics** — Automated work-hour calculations with break detection
- **Proactive alerting** — Notifications for anomalies, late arrivals, and emergencies
- **Self-service capabilities** — Employees manage their own attendance records
- **Emergency readiness** — Instant headcount for evacuations

**In Scope:**
- Single-level office with scalable entry points (initially 2 doors)
- Responsive web application (desktop, tablet, mobile)
- Biometric scanner hardware simulation for development/demo
- Email, in-app, and WhatsApp (high-priority) notifications
- Export to CSV, PDF, and Excel formats

**Out of Scope:**
- Multi-building or multi-floor tracking
- Native mobile applications (iOS/Android)
- Third-party HR/payroll system integration
- Actual biometric hardware procurement

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|-----------|
| **ERAOTS** | Enterprise Real-Time Attendance & Occupancy Tracking System |
| **Scan Event** | A single fingerprint scan at a door scanner, generating an IN or OUT log |
| **Smart Toggle** | Logic that determines scan direction (IN/OUT) based on the employee's previous state |
| **Occupancy** | The count of employees currently physically inside the workspace |
| **Active Duration** | Total time an employee spent inside the workspace, excluding short breaks |
| **Grace Period** | Configurable window after shift start where arrival is not marked "late" |
| **RBAC** | Role-Based Access Control |
| **JWT** | JSON Web Token — used for API authentication |
| **WebSocket** | Protocol enabling real-time bidirectional communication between client and server |
| **REST API** | Representational State Transfer Application Programming Interface |
| **ORM** | Object-Relational Mapping — maps database tables to code objects |

### 1.4 References

- IEEE 830-1998: Recommended Practice for Software Requirements Specifications
- Project Assessment Brief: "Enterprise Attendance & Occupancy Tracking System"
- GDPR Article 9 — Processing of Special Categories of Personal Data (biometric)

### 1.5 Document Overview

Section 2 provides a high-level system overview. Section 3 details all functional requirements. Section 4 covers non-functional requirements. Section 5 expands system feature logic. Section 6 defines data models and the ER diagram.

---

## 2. Overall Description

### 2.1 Product Perspective

ERAOTS is a standalone, self-contained system. It receives input from biometric door scanners (simulated during development) and presents information through a responsive web interface.

**System Context Diagram:**

```
                    ┌─────────────────────────────────┐
                    │         ERAOTS System            │
                    │                                   │
  Biometric         │  ┌───────────┐  ┌────────────┐  │         Email
  Scanners ────────►│  │  Backend   │  │  Frontend   │  │────────► Service
  (2 doors)         │  │  (FastAPI) │  │  (React)    │  │
                    │  └─────┬─────┘  └────────────┘  │         WhatsApp
                    │        │                          │────────► (Twilio)
                    │  ┌─────▼─────┐                   │
                    │  │PostgreSQL │  ┌─────┐          │
                    │  │ Database  │  │Redis│          │
                    │  └───────────┘  └─────┘          │
                    └─────────────────────────────────┘
```

### 2.2 Product Functions (Summary)

| ID | Function | Category |
|----|----------|----------|
| FR1 | Biometric Event Listener | Core |
| FR2 | Real-Time Occupancy Engine | Core |
| FR3 | Live Dashboard | Core |
| FR4 | Attendance Reporting | Core |
| FR5 | Admin Control Panel | Core |
| FR6 | Notification & Alert Engine | Enhanced |
| FR8 | Leave & Schedule Management | Enhanced |
| FR9 | Emergency Evacuation Mode | Enhanced |
| FR10 | Employee Self-Service Portal | Enhanced |
| FR12 | Analytics & AI Insights | Innovation |
| FR13 | Hardware Health Monitoring | Operational |
| FR14 | Attendance Correction Workflow | Enhanced |
| FR15 | Configurable Policy Engine | Enhanced |

### 2.3 User Characteristics

| Role | Description | Technical Level |
|------|------------|----------------|
| **Super Admin** | IT staff configuring the system, managing hardware, and system policies | High |
| **HR Manager** | HR personnel accessing reports, approving corrections, managing schedules | Low-Medium |
| **Employee** | Regular staff viewing personal attendance and submitting requests | Low |

### 2.4 Constraints

- **Platform:** Responsive web application — must function on Chrome, Firefox, Safari, Edge
- **Tech Stack:** Python (FastAPI) backend, React (Vite) frontend, PostgreSQL database, Redis cache
- **Hardware:** Biometric scanners are simulated; API contract is designed for real hardware integration
- **Timeline:** 3-week development cycle
- **Team:** 11 first-year university students using AI-assisted development (vibe coding)
- **Budget:** Zero — all tools must be free/open-source or have free tiers

### 2.5 Assumptions and Dependencies

- The office has a single level with 2 entry/exit points (scalable to N doors)
- Each employee has a unique fingerprint ID registered in the system
- Scanners are placed at doorways and capture scans for both entry and exit
- Internet connectivity is available for notifications (email, WhatsApp)
- The system operates in a single timezone
- Development uses a hardware simulator that mirrors real scanner API contracts

---

## 3. Functional Requirements

### FR1: Biometric Event Listener

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Description** | A service that receives, validates, and persists raw scan events from biometric door hardware |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR1.1 | The system SHALL accept scan events via a REST endpoint (`POST /api/events/scan`) containing `scanner_id`, `fingerprint_id`, and `timestamp` |
| FR1.2 | The system SHALL validate that the `fingerprint_id` exists in the employee registry |
| FR1.3 | The system SHALL reject and log events from unregistered fingerprint IDs as "unauthorized access attempts" |
| FR1.4 | The system SHALL persist every valid scan event as an **immutable** record with a server-generated UUID |
| FR1.5 | The system SHALL support receiving events from multiple scanners simultaneously without data loss |
| FR1.6 | The system SHALL buffer incoming events when the database is temporarily unavailable and retry persistence upon recovery |
| FR1.7 | The system SHALL detect and flag duplicate scans (same employee, same scanner, within 10 seconds) |

---

### FR2: Real-Time Occupancy Engine

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Description** | A logic layer that determines each employee's current presence state based on sequential scan events |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR2.1 | The system SHALL implement **Smart Toggle** logic: if an employee's last known state is OUT, the next scan is IN, and vice versa |
| FR2.2 | The system SHALL maintain a real-time state for each employee: `ACTIVE` (inside), `ON_BREAK` (outside < 30 min), `AWAY` (outside > 30 min), or `OUTSIDE` (not in building) |
| FR2.3 | The system SHALL automatically transition an employee from `ON_BREAK` to `AWAY` after 30 minutes of being outside (configurable via FR15) |
| FR2.4 | The system SHALL calculate and cache the total occupancy count in real-time |
| FR2.5 | The system SHALL handle edge cases: missed scans (see FR14), double scans (FR1.7), and end-of-day auto-checkout |
| FR2.6 | The system SHALL perform an automatic end-of-day checkout at a configurable time (default: 11:59 PM) for any employee still showing as ACTIVE |

---

### FR3: Live Dashboard

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Description** | A high-visibility, real-time web interface showing current office occupancy and activity |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR3.1 | The dashboard SHALL display the current total occupancy count and percentage of capacity |
| FR3.2 | The dashboard SHALL show a live feed of the most recent entry/exit events (last 50) |
| FR3.3 | The dashboard SHALL update in real-time via WebSocket — no manual refresh required |
| FR3.4 | The dashboard SHALL display employee status breakdown: count of ACTIVE, ON_BREAK, AWAY |
| FR3.5 | The dashboard SHALL provide a searchable employee list with current status indicators (color-coded) |
| FR3.6 | The dashboard SHALL display per-door activity (entries/exits per scanner) |
| FR3.7 | The dashboard SHALL be responsive — usable on desktop (1920px), tablet (768px), and mobile (375px) |
| FR3.8 | The dashboard SHALL support a **Wall Display Mode** (kiosk) — simplified, large-font view for lobby screens |

---

### FR4: Attendance Reporting

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Description** | Automated calculation and generation of attendance reports |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR4.1 | The system SHALL calculate daily metrics per employee: first entry, last exit, total time in building, total active time (excluding breaks), break count, total break duration |
| FR4.2 | The system SHALL flag late arrivals based on the employee's assigned schedule and grace period policy |
| FR4.3 | The system SHALL calculate overtime as any active time beyond the scheduled shift end |
| FR4.4 | The system SHALL differentiate "Time in Building" (total) vs "Time at Desk" (active only) |
| FR4.5 | The system SHALL generate monthly attendance summaries with: days present, days absent, days late, total hours worked, average daily hours, overtime hours |
| FR4.6 | The system SHALL allow reports to be filtered by: date range, department, individual employee |
| FR4.7 | The system SHALL export reports in the user's chosen format: **CSV**, **PDF**, or **Excel** |
| FR4.8 | The system SHALL allow comparison of actual attendance against scheduled hours |

---

### FR5: Admin Control Panel

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Description** | Management interface for system configuration, employee profiles, and access control |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR5.1 | Admins SHALL be able to CRUD (Create, Read, Update, Delete) employee profiles including: name, email, phone, department, fingerprint ID, role |
| FR5.2 | Admins SHALL be able to manage departments (create, rename, assign manager, deactivate) |
| FR5.3 | Admins SHALL be able to register/deregister biometric scanners and assign them to doors |
| FR5.4 | Admins SHALL be able to assign roles (Super Admin, HR Manager, Employee) with corresponding permissions |
| FR5.5 | Admins SHALL be able to view a complete audit log of all administrative actions |
| FR5.6 | The admin panel SHALL provide bulk employee import via CSV upload |
| FR5.7 | Admins SHALL be able to configure system-wide settings: office capacity, timezone, auto-checkout time |

---

### FR6: Notification & Alert Engine

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Description** | Multi-channel notification system for proactive monitoring and alerts |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR6.1 | The system SHALL support three notification channels: **in-app** (WebSocket), **email** (SMTP), and **WhatsApp** (Twilio API, high-priority only) |
| FR6.2 | The system SHALL send in-app notifications for all alert types in real-time |
| FR6.3 | The system SHALL send email notifications for: daily attendance digests, correction request updates, weekly summaries |
| FR6.4 | The system SHALL send WhatsApp notifications ONLY for critical alerts: emergency evacuations, unauthorized access attempts, scanner hardware failures |
| FR6.5 | The system SHALL allow users to configure their notification preferences (opt-in/opt-out per channel) |
| FR6.6 | The system SHALL categorize alerts by priority: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| FR6.7 | The system SHALL generate alerts for: late arrivals (after grace), unauthorized scans, anomalous scan patterns (e.g., 3 AM entry), approaching office capacity |
| FR6.8 | The system SHALL maintain a notification history accessible to each user |
| FR6.9 | Notifications SHALL be sent asynchronously via background workers (Celery) to avoid blocking the main API |

---

### FR8: Leave & Schedule Management

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Description** | Module for defining work schedules, managing leave requests, and reconciling attendance against expected hours |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR8.1 | The system SHALL support defining named schedules (e.g., "Standard 9-5", "Early Shift 7-3") with start time, end time, and grace period |
| FR8.2 | The system SHALL allow assigning schedules at the department level (default) or individual employee level (override) |
| FR8.3 | The system SHALL support leave types: Annual Leave, Sick Leave, Work From Home (WFH), Half Day, and custom types |
| FR8.4 | Employees SHALL be able to submit leave requests with: type, date range, and reason |
| FR8.5 | HR Managers SHALL be able to approve or reject leave requests with optional comments |
| FR8.6 | The system SHALL auto-reconcile daily attendance against the assigned schedule — flagging discrepancies (absent without leave, present on a holiday) |
| FR8.7 | The system SHALL maintain a company holiday calendar configurable by admins |
| FR8.8 | The system SHALL display a team calendar view showing leave schedules and attendance patterns |

---

### FR9: Emergency Evacuation Mode

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Description** | One-click emergency activation providing instant headcount for safety and compliance |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR9.1 | Super Admins and HR Managers SHALL be able to activate Emergency Mode via a prominent button on the dashboard |
| FR9.2 | Upon activation, the system SHALL instantly generate a list of all employees currently inside the building (status = ACTIVE or ON_BREAK) |
| FR9.3 | The system SHALL display the headcount in a dedicated emergency view with: total inside, list of names, department, last known door |
| FR9.4 | The system SHALL send CRITICAL-priority WhatsApp notifications to all employees currently marked as inside |
| FR9.5 | The emergency view SHALL provide a checkbox for each employee to mark them as "accounted for" during the evacuation |
| FR9.6 | The system SHALL log the emergency event with: activation time, activating user, headcount snapshot, and deactivation time |
| FR9.7 | The system SHALL support emergency types: Fire, Drill, Security Threat, Other |
| FR9.8 | The emergency report SHALL be exportable as PDF for emergency services records |

---

### FR10: Employee Self-Service Portal

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Description** | Personal dashboard for employees to view their own attendance data and submit requests |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR10.1 | Employees SHALL be able to view their personal attendance history with daily breakdown |
| FR10.2 | Employees SHALL see their "Time at Desk" vs "Time in Building" visualized as charts |
| FR10.3 | Employees SHALL be able to submit scan correction requests when they missed a scan (see FR14) |
| FR10.4 | Employees SHALL be able to view and submit leave requests |
| FR10.5 | Employees SHALL see a personal analytics summary: average arrival time, punctuality rate, monthly trend |
| FR10.6 | Employees SHALL see their current status (ACTIVE/ON_BREAK/AWAY/OUTSIDE) and today's scan timeline |
| FR10.7 | Employees SHALL receive in-app notifications for correction request status updates and leave approvals |

---

### FR12: Analytics & AI Insights

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Description** | Data-driven analytics using statistical analysis for workforce insights |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR12.1 | The system SHALL generate a **peak hours heatmap** visualizing entry/exit frequency by hour and day of week |
| FR12.2 | The system SHALL provide **late-coming trend alerts** — flagging employees with 3+ late arrivals in a rolling 7-day window |
| FR12.3 | The system SHALL provide **occupancy forecasting** — predicting expected occupancy for each hour based on 30-day historical averages |
| FR12.4 | The system SHALL display department-wise attendance comparison charts |
| FR12.5 | The system SHALL detect and flag **anomalous patterns**: scans at unusual hours, sudden attendance drops, repeated missed scans |
| FR12.6 | The system SHALL provide a **punctuality score** per employee (0-100) based on: on-time arrivals, break discipline, and consistency |
| FR12.7 | Analytics SHALL be accessible to HR Managers and Super Admins; employees see only their personal analytics |

---

### FR13: Hardware Health Monitoring

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Description** | Real-time monitoring of biometric scanner health and connectivity |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR13.1 | Each scanner SHALL send periodic heartbeat signals to the system (configurable interval, default: 60 seconds) |
| FR13.2 | The system SHALL track scanner status: `ONLINE`, `OFFLINE`, `DEGRADED` |
| FR13.3 | The system SHALL alert admins when a scanner goes OFFLINE (no heartbeat for 3× interval) |
| FR13.4 | The system SHALL display a hardware status dashboard showing all scanners with: status, last heartbeat, event count today, error rate |
| FR13.5 | The system SHALL log all scanner status changes for historical analysis |
| FR13.6 | When a scanner recovers from OFFLINE, the system SHALL process any buffered events in chronological order |

---

### FR14: Attendance Correction Workflow

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Description** | Process for employees to request corrections for missed or erroneous scan events |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR14.1 | Employees SHALL be able to submit correction requests specifying: date, correction type (missed scan, wrong scan, other), proposed time, and reason |
| FR14.2 | Correction requests SHALL follow an approval chain: Employee → Manager → HR (configurable) |
| FR14.3 | HR Managers SHALL see a queue of pending correction requests with one-click approve/reject |
| FR14.4 | Approved corrections SHALL create a new scan event marked as `MANUAL_CORRECTION` (distinguishable from hardware scans) |
| FR14.5 | The system SHALL maintain a full audit trail for every correction: who requested, who approved, original vs corrected values |
| FR14.6 | The system SHALL recalculate attendance records automatically after a correction is approved |
| FR14.7 | The system SHALL limit correction requests to events within the last 7 days (configurable via FR15) |

---

### FR15: Configurable Policy Engine

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Description** | Rule-based configuration system allowing flexible, department-specific attendance policies |

**Requirements:**

| ID | Requirement |
|----|------------|
| FR15.1 | The system SHALL support configurable policies for: grace period (default: 15 min), maximum break duration (default: 30 min), overtime threshold, half-day rules, correction request window |
| FR15.2 | Policies SHALL be applicable at two levels: **company-wide** (default) and **department-specific** (override) |
| FR15.3 | Department-specific policies SHALL override company-wide policies for employees in that department |
| FR15.4 | Admins SHALL be able to create, modify, activate, and deactivate policies via the admin panel |
| FR15.5 | Policy changes SHALL be logged in the audit trail with effective date |
| FR15.6 | The system SHALL apply policies retroactively when recalculating attendance (e.g., after a grace period change) only if explicitly requested by admin |

---

## 4. Non-Functional Requirements

### NFR1: Reliability (Original)

| ID | Requirement |
|----|------------|
| NFR1.1 | The system SHALL buffer scan events locally when the database is temporarily unavailable |
| NFR1.2 | Buffered events SHALL be automatically processed in chronological order upon recovery |
| NFR1.3 | The system SHALL guarantee zero data loss for scan events under all failure scenarios |

### NFR2: Auditability (Original)

| ID | Requirement |
|----|------------|
| NFR2.1 | Every scan event SHALL be timestamped with server time (UTC) and stored immutably |
| NFR2.2 | Scan event records SHALL NOT be editable or deletable — corrections create new records referencing originals |
| NFR2.3 | All administrative actions SHALL be logged with: user, action, timestamp, old value, new value |

### NFR3: Concurrency (Original)

| ID | Requirement |
|----|------------|
| NFR3.1 | The system SHALL handle simultaneous scan events from all registered scanners without race conditions |
| NFR3.2 | The system SHALL use database-level locking or atomic operations to prevent state corruption during concurrent updates |

### NFR4: Data Privacy & Compliance

| ID | Requirement |
|----|------------|
| NFR4.1 | All biometric identifiers (fingerprint IDs) SHALL be stored as hashed values, never in plaintext |
| NFR4.2 | All data in transit SHALL use TLS 1.2+ encryption (HTTPS) |
| NFR4.3 | All sensitive data at rest SHALL be encrypted using AES-256 |
| NFR4.4 | The system SHALL support configurable data retention policies (auto-purge scan logs older than N months) |
| NFR4.5 | Employee biometric data SHALL be deletable upon request (right to erasure) |
| NFR4.6 | Access to personal attendance data SHALL be restricted to: the employee themselves, their manager, and HR |

### NFR5: Performance & Scalability

| ID | Requirement |
|----|------------|
| NFR5.1 | The live dashboard SHALL load within **2 seconds** under normal operating conditions |
| NFR5.2 | API endpoints SHALL respond within **500ms** for standard CRUD operations |
| NFR5.3 | Scan event processing (from receipt to dashboard update) SHALL complete within **1 second** |
| NFR5.4 | The system SHALL support up to **500 concurrent users** without performance degradation |
| NFR5.5 | The architecture SHALL support horizontal scaling by adding additional API server instances behind a load balancer |
| NFR5.6 | Frequently accessed data (occupancy count, employee states) SHALL be cached in Redis with < 100ms read time |

### NFR6: Security

| ID | Requirement |
|----|------------|
| NFR6.1 | The system SHALL implement Role-Based Access Control (RBAC) with three roles: Super Admin, HR Manager, Employee |
| NFR6.2 | Authentication SHALL use JWT tokens with configurable expiry (default: 8 hours) |
| NFR6.3 | Super Admin accounts SHALL require Multi-Factor Authentication (MFA) |
| NFR6.4 | User sessions SHALL auto-expire after 30 minutes of inactivity |
| NFR6.5 | The API SHALL implement rate limiting (100 requests/minute per user for standard endpoints) |
| NFR6.6 | Passwords SHALL be hashed using bcrypt with a minimum cost factor of 12 |
| NFR6.7 | The scanner event endpoint SHALL authenticate using API keys specific to each registered scanner |

### NFR7: Availability & Disaster Recovery

| ID | Requirement |
|----|------------|
| NFR7.1 | The system SHALL target **99.5% uptime** during business hours (8 AM - 8 PM) |
| NFR7.2 | Database backups SHALL run automatically every 6 hours with point-in-time recovery capability |
| NFR7.3 | The system SHALL degrade gracefully — continue buffering scan events even if the dashboard or reporting modules fail |
| NFR7.4 | Critical system errors SHALL trigger automated alerts to Super Admins via email and WhatsApp |

### NFR8: Maintainability

| ID | Requirement |
|----|------------|
| NFR8.1 | The codebase SHALL follow a modular architecture with clear separation: API layer, service/business logic layer, data access layer |
| NFR8.2 | All API endpoints SHALL be documented using OpenAPI/Swagger (auto-generated by FastAPI) |
| NFR8.3 | The system SHALL use database migrations (Alembic) for all schema changes |
| NFR8.4 | All modules SHALL include logging with correlation IDs for request tracing |
| NFR8.5 | The project SHALL include a README with setup instructions reproducible by any developer |

### NFR9: Testability

| ID | Requirement |
|----|------------|
| NFR9.1 | All business logic modules SHALL have minimum **80% unit test coverage** |
| NFR9.2 | Integration tests SHALL cover all critical API endpoints with both valid and invalid inputs |
| NFR9.3 | The hardware simulator SHALL support automated test scenarios: normal flow, missed scans, double scans, concurrent scans, scanner failure |
| NFR9.4 | Load testing SHALL be documented with benchmarks for the concurrency requirements |

---

## 5. System Features Detail

### 5.1 Smart Toggle Logic

When a single scanner serves both entry and exit:

```
State Machine:
                    ┌──────────────┐
         Scan       │              │    Scan
    ┌──────────────►│   OUTSIDE    │◄──────────────┐
    │               │              │               │
    │               └──────┬───────┘               │
    │                      │ Scan                   │
    │                      ▼                       │
    │               ┌──────────────┐               │
    │               │              │    >30 min     │
    │               │    ACTIVE    ├───────────┐   │
    │               │   (Inside)   │           │   │
    │               └──────┬───────┘           │   │
    │                      │ Scan (exit)        │   │
    │                      ▼                   │   │
    │               ┌──────────────┐           │   │
    │    >30 min    │              │           ▼   │
    └───────────────┤   ON_BREAK   │    ┌──────────┐
                    │  (<30 min)   │    │   AWAY   │
                    │              ├───►│ (>30 min)│
                    └──────────────┘    └──────────┘
```

**Edge Case Handling:**

| Scenario | System Response |
|----------|----------------|
| Double scan (< 10 sec) | Ignore second scan, log as duplicate |
| Missed exit scan | End-of-day auto-checkout; flagged for FR14 correction |
| Scan at unregistered scanner | Reject, log as unauthorized, trigger FR6 alert |
| Two employees scan simultaneously at different doors | Process independently — atomic operations per employee (NFR3) |

### 5.2 Active Duration Calculation

```
Total Time in Building = Last Exit - First Entry
Break Time = Sum of all (Re-entry - Exit) where duration < break_threshold
Active Duration = Total Time in Building - Break Time
Overtime = max(0, Active Duration - Scheduled Hours)
```

### 5.3 Notification Priority Matrix

| Event | Priority | Channels |
|-------|----------|----------|
| Emergency evacuation | CRITICAL | In-App + Email + WhatsApp |
| Unauthorized access | CRITICAL | In-App + WhatsApp |
| Scanner offline | HIGH | In-App + Email |
| Employee absent without notice | HIGH | In-App + Email |
| Late arrival | MEDIUM | In-App |
| Correction request update | MEDIUM | In-App + Email |
| Daily attendance digest | LOW | Email |
| Weekly summary | LOW | Email |

### 5.4 Role Permission Matrix

| Feature | Super Admin | HR Manager | Employee |
|---------|:-----------:|:----------:|:--------:|
| View live dashboard | ✅ | ✅ | ✅ (limited) |
| View all employee attendance | ✅ | ✅ | ❌ |
| View own attendance | ✅ | ✅ | ✅ |
| Generate reports | ✅ | ✅ | ❌ |
| Export reports | ✅ | ✅ | ❌ |
| Manage employees | ✅ | ❌ | ❌ |
| Manage scanners | ✅ | ❌ | ❌ |
| Manage schedules | ✅ | ✅ | ❌ |
| Approve leave requests | ❌ | ✅ | ❌ |
| Submit leave requests | ✅ | ✅ | ✅ |
| Approve corrections | ❌ | ✅ | ❌ |
| Submit corrections | ✅ | ✅ | ✅ |
| Configure policies | ✅ | ❌ | ❌ |
| Activate emergency mode | ✅ | ✅ | ❌ |
| View analytics | ✅ | ✅ | Own only |
| View hardware status | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |

---

## 6. Data Requirements

The complete Entity-Relationship diagram is provided in the companion document: **ER_Diagram.md**

### 6.1 Data Dictionary (Key Entities)

| Entity | Description | Estimated Volume |
|--------|-------------|-----------------|
| Employee | Staff profiles with biometric IDs | 100-500 records |
| Department | Organizational units | 5-20 records |
| Scanner | Biometric door hardware | 2-10 records |
| ScanEvent | Immutable raw scan logs | ~1,000/day (growing) |
| OccupancyState | Current live state per employee | 1 per employee (real-time) |
| AttendanceRecord | Processed daily attendance | 1 per employee per day |
| Schedule | Work shift definitions | 5-10 records |
| LeaveRequest | Employee leave submissions | ~50/month |
| Notification | All sent alerts | ~500/day |
| CorrectionRequest | Scan correction submissions | ~20/month |
| Policy | Configurable business rules | 10-30 records |
| EmergencyEvent | Evacuation activations | Rare (~1/quarter) |
| AuditLog | All system actions | ~200/day (growing) |

---

## 7. Appendices

### 7.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend Framework** | Python + FastAPI | Python 3.11+, FastAPI 0.100+ |
| **ORM** | SQLAlchemy | 2.0+ |
| **Migrations** | Alembic | Latest |
| **Database** | PostgreSQL | 15+ |
| **Cache / Queue** | Redis | 7+ |
| **Task Queue** | Celery | 5+ |
| **Frontend Framework** | React | 18+ |
| **Frontend Build** | Vite | 5+ |
| **Charts** | Recharts | Latest |
| **HTTP Client** | Axios | Latest |
| **Authentication** | JWT (PyJWT) | Latest |
| **Email** | SMTP / SendGrid | Free tier |
| **WhatsApp** | Twilio API | Sandbox |
| **PDF Export** | ReportLab / WeasyPrint | Latest |
| **Excel Export** | openpyxl | Latest |
| **Testing** | pytest + React Testing Library | Latest |
| **API Docs** | Swagger UI (auto by FastAPI) | Built-in |
| **Version Control** | Git + GitHub | Latest |

### 7.2 Glossary

| Term | Definition |
|------|-----------|
| Vibe Coding | AI-assisted software development where developers use AI tools to generate, debug, and refine code |
| Heartbeat | Periodic signal from hardware indicating it is online and functioning |
| Smart Toggle | Algorithm that determines scan direction by inverting the employee's previous known state |
| Grace Period | Buffer time after scheduled start allowing arrival without "late" flag |
| Atomic Operation | Database operation that completes fully or not at all, preventing partial updates |

### 7.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 5, 2026 | Development Team | Initial SRS creation |
