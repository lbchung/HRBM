-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('SELECTED', 'UNIT_MANAGER', 'ROLE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('WORKING', 'PROBATION', 'LONG_LEAVE', 'RESIGNED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SalaryForm" AS ENUM ('COEFFICIENT', 'FIXED');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('LOCAL', 'FAST');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_last_counter" INTEGER;

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "owner_type" VARCHAR(50),
    "owner_id" VARCHAR(100),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" VARCHAR(500),
    "meta" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_parameters" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "effective_from" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "legal_basis" VARCHAR(500),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "policy_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "approver_type" "ApproverType" NOT NULL,
    "role_id" UUID,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "content" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "current_step" INTEGER NOT NULL,
    "steps_snapshot" JSONB NOT NULL,
    "unit_id" UUID,
    "campus_id" UUID,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_assignees" (
    "request_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "approval_assignees_pkey" PRIMARY KEY ("request_id","step_order","user_id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(200) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "search_text" VARCHAR(600) NOT NULL DEFAULT '',
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE,
    "place_of_birth" VARCHAR(300),
    "hometown" VARCHAR(300),
    "nationality" VARCHAR(100),
    "ethnicity_code" VARCHAR(50),
    "religion_code" VARCHAR(50),
    "id_number_enc" VARCHAR(255),
    "id_number_hash" VARCHAR(64),
    "id_issue_date" DATE,
    "id_issue_place" VARCHAR(200),
    "tax_code_enc" VARCHAR(255),
    "social_insurance_no" VARCHAR(20),
    "health_insurance_no" VARCHAR(20),
    "bank_account_enc" VARCHAR(255),
    "bank_code" VARCHAR(50),
    "bank_branch" VARCHAR(200),
    "phone" VARCHAR(20),
    "email" VARCHAR(200),
    "permanent_address" VARCHAR(500),
    "current_address" VARCHAR(500),
    "marital_status" VARCHAR(20),
    "photo_file_id" UUID,
    "campus_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "position_code" VARCHAR(50),
    "job_title_code" VARCHAR(50),
    "contract_type_code" VARCHAR(50),
    "education_level_code" VARCHAR(50),
    "academic_title_code" VARCHAR(50),
    "specialty" VARCHAR(200),
    "start_date" DATE,
    "recruitment_date" DATE,
    "party_join_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'WORKING',
    "leave_date" DATE,
    "leave_reason" VARCHAR(500),
    "user_id" UUID,
    "source" "RecordSource" NOT NULL DEFAULT 'LOCAL',
    "external_id" VARCHAR(100),
    "note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_family_members" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "relationship_code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "birth_year" INTEGER,
    "occupation" VARCHAR(200),
    "workplace" VARCHAR(300),
    "phone" VARCHAR(20),
    "is_dependant" BOOLEAN NOT NULL DEFAULT false,
    "dependant_tax_code" VARCHAR(20),
    "deduction_from" DATE,
    "deduction_to" DATE,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_work_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "event_type_code" VARCHAR(50) NOT NULL,
    "decision_no" VARCHAR(100),
    "decision_date" DATE,
    "effective_date" DATE NOT NULL,
    "from_unit_id" UUID,
    "to_unit_id" UUID,
    "position_code" VARCHAR(50),
    "job_title_code" VARCHAR(50),
    "content" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_work_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "contract_no" VARCHAR(100),
    "contract_type_code" VARCHAR(50) NOT NULL,
    "sign_date" DATE,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "salary_form" "SalaryForm" NOT NULL DEFAULT 'COEFFICIENT',
    "file_id" UUID,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_assignments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "unit_id" UUID,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "decision_no" VARCHAR(100),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "campus_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "category_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_trainings" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "training_type_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "institution" VARCHAR(300),
    "major" VARCHAR(200),
    "from_date" DATE,
    "to_date" DATE,
    "certificate_no" VARCHAR(100),
    "issue_date" DATE,
    "expiry_date" DATE,
    "hours" DECIMAL(8,2),
    "result" VARCHAR(200),
    "file_id" UUID,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_rewards" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "form_code" VARCHAR(50) NOT NULL,
    "level_code" VARCHAR(50),
    "year" INTEGER NOT NULL,
    "decision_no" VARCHAR(100),
    "decision_date" DATE,
    "content" VARCHAR(2000),
    "amount" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_disciplines" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "form_code" VARCHAR(50) NOT NULL,
    "decision_no" VARCHAR(100),
    "decision_date" DATE,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "reason" VARCHAR(2000),
    "delay_raise_months" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "salary_form" "SalaryForm" NOT NULL,
    "scale_code" VARCHAR(50),
    "step" INTEGER,
    "coefficient" DECIMAL(6,3),
    "beyond_scale_percent" DECIMAL(5,2),
    "fixed_amount" DECIMAL(18,2),
    "next_raise_date" DATE,
    "decision_no" VARCHAR(100),
    "decision_date" DATE,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_allowances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "allowance_type_code" VARCHAR(50) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "decision_no" VARCHAR(100),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_income_coefficients" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "stabilization_coef" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "management_coef" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "other_coef" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employee_income_coefficients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_ownership" (
    "entity" VARCHAR(50) NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'FAST',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "integration_ownership_pkey" PRIMARY KEY ("entity")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" UUID NOT NULL,
    "integration" VARCHAR(30) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "trigger" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "message" VARCHAR(2000),
    "details" JSONB,
    "triggered_by" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_owner_type_owner_id_idx" ON "files"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "catalog_items_type_sort_order_idx" ON "catalog_items"("type", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_type_code_key" ON "catalog_items"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "policy_parameters_code_effective_from_key" ON "policy_parameters"("code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_code_key" ON "approval_workflows"("code");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflow_id_step_order_key" ON "approval_steps"("workflow_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_requests_target_type_target_id_idx" ON "approval_requests"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_requested_by_idx" ON "approval_requests"("requested_by");

-- CreateIndex
CREATE INDEX "approval_assignees_user_id_idx" ON "approval_assignees"("user_id");

-- CreateIndex
CREATE INDEX "approval_actions_request_id_idx" ON "approval_actions"("request_id");

-- CreateIndex
CREATE INDEX "approval_actions_actor_id_idx" ON "approval_actions"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_number_hash_key" ON "employees"("id_number_hash");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_campus_id_idx" ON "employees"("campus_id");

-- CreateIndex
CREATE INDEX "employees_unit_id_idx" ON "employees"("unit_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_search_text_idx" ON "employees"("search_text");

-- CreateIndex
CREATE UNIQUE INDEX "employees_source_external_id_key" ON "employees"("source", "external_id");

-- CreateIndex
CREATE INDEX "employee_family_members_employee_id_idx" ON "employee_family_members"("employee_id");

-- CreateIndex
CREATE INDEX "employee_work_history_employee_id_effective_date_idx" ON "employee_work_history"("employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "employee_contracts_employee_id_start_date_idx" ON "employee_contracts"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_contracts_end_date_idx" ON "employee_contracts"("end_date");

-- CreateIndex
CREATE INDEX "campus_assignments_employee_id_from_date_idx" ON "campus_assignments"("employee_id", "from_date");

-- CreateIndex
CREATE INDEX "campus_assignments_campus_id_from_date_to_date_idx" ON "campus_assignments"("campus_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- CreateIndex
CREATE INDEX "employee_trainings_employee_id_idx" ON "employee_trainings"("employee_id");

-- CreateIndex
CREATE INDEX "employee_trainings_expiry_date_idx" ON "employee_trainings"("expiry_date");

-- CreateIndex
CREATE INDEX "employee_rewards_employee_id_idx" ON "employee_rewards"("employee_id");

-- CreateIndex
CREATE INDEX "employee_rewards_year_idx" ON "employee_rewards"("year");

-- CreateIndex
CREATE INDEX "employee_disciplines_employee_id_idx" ON "employee_disciplines"("employee_id");

-- CreateIndex
CREATE INDEX "employee_salaries_next_raise_date_idx" ON "employee_salaries"("next_raise_date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salaries_employee_id_effective_from_key" ON "employee_salaries"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_allowances_employee_id_effective_from_idx" ON "employee_allowances"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "employee_income_coefficients_employee_id_effective_from_key" ON "employee_income_coefficients"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "integration_sync_logs_integration_started_at_idx" ON "integration_sync_logs"("integration", "started_at");

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_family_members" ADD CONSTRAINT "employee_family_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_history" ADD CONSTRAINT "employee_work_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_history" ADD CONSTRAINT "employee_work_history_from_unit_id_fkey" FOREIGN KEY ("from_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_history" ADD CONSTRAINT "employee_work_history_to_unit_id_fkey" FOREIGN KEY ("to_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_assignments" ADD CONSTRAINT "campus_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_assignments" ADD CONSTRAINT "campus_assignments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus_assignments" ADD CONSTRAINT "campus_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_rewards" ADD CONSTRAINT "employee_rewards_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_disciplines" ADD CONSTRAINT "employee_disciplines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_allowances" ADD CONSTRAINT "employee_allowances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_income_coefficients" ADD CONSTRAINT "employee_income_coefficients_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
