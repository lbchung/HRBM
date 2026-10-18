-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('WORK', 'DUTY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HalfDay" AS ENUM ('AM', 'PM');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'LEAVE_HALF', 'HOLIDAY', 'MISSING_IN', 'MISSING_OUT', 'NO_SCHEDULE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CLOSED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "attendance_code" VARCHAR(50);

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "default_shift_id" UUID;

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "ShiftType" NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 5,
    "early_grace_minutes" INTEGER NOT NULL DEFAULT 5,
    "check_in_before_minutes" INTEGER NOT NULL DEFAULT 120,
    "check_out_after_minutes" INTEGER NOT NULL DEFAULT 240,
    "work_units" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "color" VARCHAR(20),
    "campus_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_pay_rates" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "legal_basis" VARCHAR(500),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "duty_pay_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "campus_id" UUID NOT NULL,
    "location" VARCHAR(300),
    "host" VARCHAR(200) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "use_https" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(100) NOT NULL,
    "password_enc" VARCHAR(500) NOT NULL,
    "event_minors" VARCHAR(100) NOT NULL DEFAULT '75',
    "model" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "firmware" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_event_time" TIMESTAMPTZ(6),
    "last_serial_no" INTEGER,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_sync_status" VARCHAR(20),
    "last_error" VARCHAR(1000),
    "last_fetched_count" INTEGER,
    "clock_offset_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_raw_punches" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "serial_no" INTEGER NOT NULL,
    "employee_no" VARCHAR(50) NOT NULL,
    "employee_id" UUID,
    "punch_time" TIMESTAMPTZ(6) NOT NULL,
    "campus_id" UUID NOT NULL,
    "verify_mode" VARCHAR(30),
    "event_minor" INTEGER,
    "person_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_raw_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shift_id" UUID NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "counts_as_work" BOOLEAN NOT NULL DEFAULT false,
    "deduct_annual_leave" BOOLEAN NOT NULL DEFAULT false,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "workflow_code" VARCHAR(50) NOT NULL DEFAULT 'LEAVE_DEFAULT',
    "max_days_per_request" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "start_session" "HalfDay" NOT NULL DEFAULT 'AM',
    "end_session" "HalfDay" NOT NULL DEFAULT 'PM',
    "days" DECIMAL(5,1) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "destination" VARCHAR(300),
    "file_id" UUID,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approval_request_id" UUID,
    "unit_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" DECIMAL(5,1) NOT NULL,
    "carried_over_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "adjustment_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_timesheets" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "slot_key" VARCHAR(40) NOT NULL,
    "shift_id" UUID,
    "unit_id" UUID NOT NULL,
    "campus_id" UUID,
    "expected_campus_id" UUID NOT NULL,
    "status" "TimesheetStatus" NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "work_units" DECIMAL(4,2) NOT NULL,
    "scheduled_start" TIMESTAMPTZ(6),
    "scheduled_end" TIMESTAMPTZ(6),
    "first_in" TIMESTAMPTZ(6),
    "last_out" TIMESTAMPTZ(6),
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "is_early" BOOLEAN NOT NULL DEFAULT false,
    "campus_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "leave_request_id" UUID,
    "override_symbol" VARCHAR(10),
    "override_work_units" DECIMAL(4,2),
    "override_reason" VARCHAR(500),
    "overridden_by" UUID,
    "overridden_at" TIMESTAMPTZ(6),
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "note" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_timesheets" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "unit_id" UUID NOT NULL,
    "work_units" DECIMAL(6,2) NOT NULL,
    "duty_count" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" VARCHAR(1000),
    "link" VARCHAR(300),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_code_key" ON "shifts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "duty_pay_rates_shift_id_effective_from_key" ON "duty_pay_rates"("shift_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_code_key" ON "attendance_devices"("code");

-- CreateIndex
CREATE INDEX "attendance_raw_punches_employee_id_punch_time_idx" ON "attendance_raw_punches"("employee_id", "punch_time");

-- CreateIndex
CREATE INDEX "attendance_raw_punches_punch_time_idx" ON "attendance_raw_punches" USING BRIN ("punch_time");

-- CreateIndex
CREATE INDEX "attendance_raw_punches_employee_no_idx" ON "attendance_raw_punches"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_raw_punches_device_id_serial_no_key" ON "attendance_raw_punches"("device_id", "serial_no");

-- CreateIndex
CREATE INDEX "schedules_date_idx" ON "schedules"("date");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_employee_id_date_shift_id_key" ON "schedules"("employee_id", "date", "shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_code_key" ON "leave_requests"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_approval_request_id_key" ON "leave_requests"("approval_request_id");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_from_date_idx" ON "leave_requests"("employee_id", "from_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_unit_id_from_date_idx" ON "leave_requests"("unit_id", "from_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_year_key" ON "leave_balances"("employee_id", "year");

-- CreateIndex
CREATE INDEX "daily_timesheets_unit_id_date_idx" ON "daily_timesheets"("unit_id", "date");

-- CreateIndex
CREATE INDEX "daily_timesheets_date_idx" ON "daily_timesheets"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_timesheets_employee_id_date_slot_key_key" ON "daily_timesheets"("employee_id", "date", "slot_key");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_periods_unit_id_month_key" ON "timesheet_periods"("unit_id", "month");

-- CreateIndex
CREATE INDEX "monthly_timesheets_month_unit_id_idx" ON "monthly_timesheets"("month", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_timesheets_employee_id_month_key" ON "monthly_timesheets"("employee_id", "month");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "employees_attendance_code_key" ON "employees"("attendance_code");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_default_shift_id_fkey" FOREIGN KEY ("default_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_pay_rates" ADD CONSTRAINT "duty_pay_rates_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_raw_punches" ADD CONSTRAINT "attendance_raw_punches_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_raw_punches" ADD CONSTRAINT "attendance_raw_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_timesheets" ADD CONSTRAINT "daily_timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_timesheets" ADD CONSTRAINT "daily_timesheets_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_timesheets" ADD CONSTRAINT "monthly_timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

