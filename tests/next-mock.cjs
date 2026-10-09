// Optional API capabilities for existing regression fixtures. Dedicated next.cjs
// and backend-next.cjs exercise persistence, conflicts and access checks.
module.exports=async function(route,data) {
    let result;
    if(data.action==='get_review_capabilities')result={status:'success',documentReviewSupported:true,archiveSupported:true};
    else if(data.action==='get_form_draft')result={status:'success',draft:{exists:false,fields:{},revision:0,updatedAt:''}};
    else if(data.action==='save_form_draft')result={status:'success',draft:{exists:Object.keys(data.fields).length>0,fields:data.fields,revision:data.revision+1,updatedAt:new Date().toISOString(),requestId:data.requestId}};
    else if(data.action==='report_health')result={status:'success'};
    else if(data.action==='get_health')result={status:'success',events:[]};
    else return false;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});return true;
};
