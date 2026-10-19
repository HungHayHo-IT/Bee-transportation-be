# -*- coding: utf-8 -*-
"""Chạy toàn bộ bộ test đối kháng.  PYTHONIOENCODING=utf-8 python scripts/qa/run_all.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import qa_lib, qa_authz, qa_state, qa_robust, qa_report_fixes   # noqa: E402

import subprocess
print('Dọn dữ liệu giao dịch (bộ test phải chạy lại được nhiều lần)...')
subprocess.run(['docker', 'exec', 'beeops-postgres', 'psql', '-U', 'beeops', '-d', 'beeops',
                '-q', '-c', 'TRUNCATE orders, order_departments, order_milestones, comments,'
                ' notifications, activity_log, customers RESTART IDENTITY CASCADE;'],
               capture_output=True)

print('Dựng dữ liệu nền...')
f = qa_lib.build_fixture()
qa_authz.run(f)
qa_state.run(f)
qa_robust.run(f)
qa_report_fixes.run(f)
sys.exit(1 if qa_lib.report() else 0)
