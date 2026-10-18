-- CreateEnum
CREATE TYPE "ComponentKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER', 'INFO');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RaiseKind" AS ENUM ('REGULAR', 'EARLY', 'BEYOND_SCALE');

-- CreateEnum
CREATE TYPE "RaiseStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetroStatus" AS ENUM ('PENDING', 'INCLUDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExtraIncomeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PAID');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "formula" VARCHAR(2000) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "round_digits" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "show_on_payslip" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_scales" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "raise_interval_months" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_scale_steps" (
    "id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "coefficient" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "salary_scale_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pit_bracket_versions" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "brackets" JSONB NOT NULL,
    "legal_basis" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "pit_bracket_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "note" VARCHAR(1000),
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB,
    "calculated_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "salary_form" VARCHAR(20),
    "inputs" JSONB NOT NULL,
    "campus_split" JSONB,
    "gross" DECIMAL(18,2) NOT NULL,
    "taxable" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "employer_cost" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "errors" JSONB,
    "timesheet_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" BIGSERIAL NOT NULL,
    "item_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(24,10) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_raises" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "RaiseKind" NOT NULL,
    "scale_code" VARCHAR(20),
    "from_step" INTEGER,
    "to_step" INTEGER,
    "from_coefficient" DECIMAL(6,3),
    "to_coefficient" DECIMAL(6,3),
    "from_beyond_pct" DECIMAL(5,2),
    "to_beyond_pct" DECIMAL(5,2),
    "due_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "status" "RaiseStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" VARCHAR(1000),
    "decision_no" VARCHAR(100),
    "decision_date" DATE,
    "result_salary_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "salary_raises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retro_pays" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "from_month" VARCHAR(7) NOT NULL,
    "to_month" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "ins_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL,
    "status" "RetroStatus" NOT NULL DEFAULT 'PENDING',
    "included_run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "retro_pays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_income_proposals" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "unit_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "note" VARCHAR(1000),
    "status" "ExtraIncomeStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(18,2) NOT NULL,
    "approval_request_id" UUID,
    "paid_run_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extra_income_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_income_lines" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(300),

    CONSTRAINT "extra_income_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_code_key" ON "salary_components"("code");

-- CreateIndex
CREATE UNIQUE INDEX "salary_scales_code_key" ON "salary_scales"("code");

-- CreateIndex
CREATE UNIQUE INDEX "salary_scale_steps_scale_id_step_key" ON "salary_scale_steps"("scale_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "pit_bracket_versions_effective_from_key" ON "pit_bracket_versions"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_code_key" ON "payroll_runs"("code");

-- CreateIndex
CREATE INDEX "payroll_runs_month_idx" ON "payroll_runs"("month");

-- CreateIndex
CREATE INDEX "payroll_items_employee_id_idx" ON "payroll_items"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_items_run_id_unit_id_idx" ON "payroll_items"("run_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_run_id_employee_id_key" ON "payroll_items"("run_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_lines_item_id_idx" ON "payroll_lines"("item_id");

-- CreateIndex
CREATE INDEX "salary_raises_employee_id_idx" ON "salary_raises"("employee_id");

-- CreateIndex
CREATE INDEX "salary_raises_status_due_date_idx" ON "salary_raises"("status", "due_date");

-- CreateIndex
CREATE INDEX "retro_pays_employee_id_status_idx" ON "retro_pays"("employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "extra_income_proposals_code_key" ON "extra_income_proposals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "extra_income_proposals_approval_request_id_key" ON "extra_income_proposals"("approval_request_id");

-- CreateIndex
CREATE INDEX "extra_income_proposals_month_status_idx" ON "extra_income_proposals"("month", "status");

-- CreateIndex
CREATE INDEX "extra_income_proposals_unit_id_idx" ON "extra_income_proposals"("unit_id");

-- CreateIndex
CREATE INDEX "extra_income_lines_employee_id_idx" ON "extra_income_lines"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "extra_income_lines_proposal_id_employee_id_key" ON "extra_income_lines"("proposal_id", "employee_id");

-- AddForeignKey
ALTER TABLE "salary_scale_steps" ADD CONSTRAINT "salary_scale_steps_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "salary_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "payroll_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_raises" ADD CONSTRAINT "salary_raises_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_pays" ADD CONSTRAINT "retro_pays_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_income_lines" ADD CONSTRAINT "extra_income_lines_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "extra_income_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_income_lines" ADD CONSTRAINT "extra_income_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

