// Opt-in pagination for list endpoints.
//
// A request with ?page= and/or ?limit= gets one page wrapped as
//   { items, total, page, limit, pages }
// A request with neither keeps the original plain-array response, so existing
// callers (dashboards, dropdowns) are unaffected.
const MAX_LIMIT = 200;

function parsePaging(query = {}) {
  if (query.page === undefined && query.limit === undefined) return null;
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), MAX_LIMIT);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { page, limit, skip: (page - 1) * limit };
}

function pagedResponse(items, total, paging) {
  return { items, total, page: paging.page, limit: paging.limit, pages: Math.ceil(total / paging.limit) };
}

module.exports = { parsePaging, pagedResponse };
