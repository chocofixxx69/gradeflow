import { buildDataset } from './dataset';
import { buildStudentRows } from './aggregate';

/** Student-wise marks/status for the given filters, paginated. */
export async function getStudentAnalysis(client, filters = {}, { session, page = 1, pageSize = 50 } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return {
            data: {
                filters_applied: filters, exam_name: ds.resolvedExamName, students: [],
                pagination: { page, pageSize, total: 0, totalPages: 0 },
                empty_reason: ds.emptyReason, meta: ds.meta,
            },
            error: null,
        };
    }

    const allRows = buildStudentRows(ds).sort((a, b) => String(a.usn).localeCompare(String(b.usn)));
    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const students = allRows.slice(start, start + pageSize);

    return {
        data: {
            filters_applied: filters,
            exam_name: ds.resolvedExamName,
            students,
            pagination: { page: safePage, pageSize, total, totalPages },
            meta: ds.meta,
        },
        error: null,
    };
}
