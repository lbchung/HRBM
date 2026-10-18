# Thuật ngữ Việt ↔ English

Dùng thống nhất cho tên bảng, cột, biến, API. Thêm thuật ngữ mới vào đây khi phát sinh.

## Tổ chức
| Tiếng Việt | Code (English) | Ghi chú |
|---|---|---|
| Cơ sở (Hà Nội, Ninh Bình) | `campus` | |
| Đơn vị (khoa, phòng, trung tâm, viện) | `unit` | `UnitType`: KHOA, PHONG, TRUNG_TAM, VIEN, KHAC |
| Chức vụ | `position` | Trưởng khoa, phó khoa… |
| Chức danh nghề nghiệp | `job_title` | Bác sĩ, điều dưỡng… |

## Hệ thống
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Tài khoản | `user` | |
| Nhóm tài khoản | `role` | |
| Quyền chức năng | `permission` | Mã: `<module>.<resource>.<action>` |
| Phạm vi dữ liệu | `data_scope` | ALL / CAMPUS / UNIT / SELF |
| Đơn vị phụ trách | `managed_unit` | |
| Nhật ký hệ thống | `audit_log` | |
| Phiên đăng nhập | `session` | |

## Nhân sự
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Hồ sơ nhân viên | `employee` | |
| Quá trình công tác | `work_history` | |
| Phân công làm việc giữa cơ sở | `campus_assignment` | Theo khoảng ngày |
| Hợp đồng | `contract` | |
| Quá trình đào tạo | `training` | |
| Chứng chỉ hành nghề | `practice_license` | |
| Khen thưởng | `reward` | |
| Kỷ luật | `discipline` | |
| Người phụ thuộc | `dependant` | Phục vụ giảm trừ gia cảnh |

## Chấm công
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Máy chấm công | `device` | Hikvision Face ID |
| Địa điểm đặt máy | `device_location` | |
| Dữ liệu quét gốc | `raw_punch` | Bất biến |
| Ca làm việc | `shift` | |
| Ca trực | `duty_shift` | |
| Lịch làm việc | `schedule` | |
| Lịch trực | `duty_roster` | |
| Bảng công ngày | `daily_timesheet` | |
| Bảng công tháng | `monthly_timesheet` | |
| Đi muộn / về sớm | `late_arrival` / `early_leave` | |
| Chốt công | `timesheet_close` | |
| Tiền trực | `duty_pay` | |

## Nghỉ - công tác
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Phiếu nghỉ / công tác / học tập | `leave_request` | |
| Loại phiếu | `leave_type` | ốm, phép, bù trực, công tác, học tập |
| Nghỉ phép năm | `annual_leave` | |
| Nghỉ ốm | `sick_leave` | |
| Bù trực | `duty_compensation` | |
| Đi công tác | `business_trip` | |
| Đi học tập | `study_leave` | |
| Quy trình duyệt | `approval_workflow` | |

## Tiền lương
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Lương cơ sở | `base_salary` | Tham số theo hiệu lực |
| Hệ số lương | `salary_coefficient` | |
| Ngạch / bậc lương | `salary_grade` / `salary_step` | |
| Lương khoán (tiền đồng) | `fixed_salary` | |
| Phụ cấp | `allowance` | |
| Phụ cấp ưu đãi nghề | `occupational_allowance` | |
| Phụ cấp thâm niên vượt khung | `beyond_scale_seniority` | |
| Phụ cấp độc hại | `hazard_allowance` | |
| Phụ cấp chức vụ | `position_allowance` | |
| Khoản lương | `salary_component` | Danh mục cấu hình được |
| Nâng lương thường xuyên | `regular_raise` | |
| Nâng lương trước hạn | `early_raise` | |
| Truy lĩnh | `retroactive_pay` | |
| Bảng lương tháng | `payroll_run` | |
| Phiếu lương | `payslip` | |
| Thu nhập tăng thêm | `extra_income` | Khoa đề xuất → TCKT duyệt |
| Ổn định thu nhập | `income_stabilization` | |
| Hệ số ổn định / quản lý / khác | `stabilization_coef` / `management_coef` / `other_coef` | |
| Bảo hiểm xã hội / y tế / thất nghiệp | `social_insurance` / `health_insurance` / `unemployment_insurance` | |
| Kinh phí công đoàn | `union_fee` | |

## Thuế TNCN
| Tiếng Việt | Code | Ghi chú |
|---|---|---|
| Thuế thu nhập cá nhân | `personal_income_tax` (`pit`) | |
| Giảm trừ gia cảnh | `family_deduction` | |
| Thu nhập chịu thuế | `taxable_income` | |
| Quyết toán thuế | `tax_finalization` | |
| Chứng từ khấu trừ | `withholding_certificate` | |
| Mã số thuế | `tax_code` | |

## Viết tắt đơn vị
| Viết tắt | Đầy đủ |
|---|---|
| TCCB | Phòng Tổ chức cán bộ |
| TCKT | Phòng Tài chính kế toán |
| KHTH | Phòng Kế hoạch tổng hợp |
| CNTT | Trung tâm Công nghệ thông tin |
