"use strict";
const $ = (id) => document.getElementById(id);
const stages = {todo:"待投递",ready:"简历已就绪",sent:"已投递",interview:"面试中",offer:"已获 Offer",closed:"已结束"};
const industries = ["新能源","船舶港航","绿色制造","出海业务","其他"];
const views = {
  all:["岗位总览","目标岗位","根据岗位要求、专业门槛与现有经历排序。"],
  track:["投递跟进","投递跟进","打开岗位更新阶段，记录投递日期、反馈和下次跟进。"],
  resume:["简历管理","一岗一简历","打开岗位编辑简历草稿，或批量关联已定制的 PDF。"]
};
const paths = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  route:'<circle cx="6" cy="18" r="2"/><path d="M8 18h8a4 4 0 0 0 0-8H8a3 3 0 0 1 0-6h6"/><circle cx="16" cy="4" r="2"/>',
  file:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 14h8m-8 3h5"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  "arrow-right":'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  external:'<path d="M13 4h7v7m0-7-9 9m7 0v6H5V6h6"/>'
};
const safe = (value) => String(value ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] ?? "")+"</svg>";
const drawIcons = (node) => node.querySelectorAll("[data-icon]").forEach((element)=>{element.innerHTML=icon(element.dataset.icon);});
const options = (entries) => Object.entries(entries).map(([value,label])=>'<option value="'+safe(value)+'">'+safe(label)+"</option>").join("");
const industryOptions = Object.fromEntries(industries.map((entry)=>[entry,entry]));
const freshState = () => ({version:1,jobs:[],removed:[],entries:{}});
let state=freshState();
let activeView="all";
let activeJob=null;
let activeTab="jd";
let editing=null;
let confirmation;
let toastTimer;
let database;

function notify(message) {
  const toast=$("toast");
  toast.textContent=message;
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.hidden=true;},4200);
}
function openStorage() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open("career-desk-private",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("workspace");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function readState() {
  return new Promise((resolve,reject)=>{
    const request=database.transaction("workspace").objectStore("workspace").get("state");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function saveState(message) {
  try {
    await new Promise((resolve,reject)=>{
      const tx=database.transaction("workspace","readwrite");
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error);
      tx.objectStore("workspace").put(state,"state");
    });
    if(message) notify(message);
  } catch {
    notify("浏览器未能保存这次修改，请导出备份。");
  }
}
function allJobs() {
  const result=new Map(window.SEED_JOBS.map((job)=>[job.id,job]));
  for(const job of state.jobs) result.set(job.id,{...result.get(job.id),...job});
  for(const id of state.removed) result.delete(id);
  return [...result.values()];
}
const emptyEntry=()=>({stage:"todo",resume:"",notes:"",followUp:"",history:[],attachment:null});
const entryFor=(id)=>state.entries[id]??emptyEntry();
function updateEntry(id,changes) {
  state.entries[id]={...entryFor(id),...changes};
}
function hasResume(job) {
  const entry=entryFor(job.id);
  return Boolean(entry.attachment||entry.resume.trim());
}
function render() {
  const jobs=allJobs();
  const count=(set)=>jobs.filter((job)=>set.includes(entryFor(job.id).stage)).length;
  const stats=[
    ["全部岗位",jobs.length,"target","",""],["待投递",count(["todo","ready"]),"calendar","gold","waiting"],
    ["已投 / 面试 / Offer",count(["sent","interview","offer"]),"send","blue","active"],
    ["已备简历",jobs.filter(hasResume).length,"file","lilac","resume"]
  ];
  $("stats").innerHTML=stats.map(([label,value,shape,color,filter])=>
    '<button class="stat" data-filter="'+filter+'" aria-pressed="'+(filter==="resume"?activeView==="resume":activeView!=="resume"&&$("status").value===filter)+'"><i class="'+color+'">'+icon(shape)+'</i><div><strong>'+value+"</strong><span>"+label+"</span></div></button>").join("");
  const filter=$("status").value;
  const industry=$("industry").value;
  const query=$("search").value.trim().toLocaleLowerCase();
  const shown=jobs.filter((job)=>{
    const stage=entryFor(job.id).stage;
    const stageMatch=!filter||stage===filter||(filter==="waiting"&&["todo","ready"].includes(stage))||(filter==="active"&&["sent","interview","offer"].includes(stage));
    return stageMatch&&(!industry||job.industry===industry)&&[job.company,job.title,job.city,job.industry].join(" ").toLocaleLowerCase().includes(query);
  });
  $("resultCount").textContent="显示 "+shown.length+" 个岗位";
  $("jobs").innerHTML=shown.length?shown.map((job)=>{
    const entry=entryFor(job.id);
    const color=job.industry==="船舶港航"?"blue":job.industry==="绿色制造"?"gold":job.industry==="出海业务"?"lilac":"";
    const info=activeView==="resume"?(entry.attachment?"已关联附件":entry.resume?"已保存草稿":job.resumeMatch?"可批量关联 PDF":"待准备简历"):job.availability||"自建岗位";
    const sub=activeView==="track"&&entry.followUp?"跟进 "+entry.followUp:job.deadline?"截止 "+job.deadline:job.availability?"截止待查":"";
    return '<button type="button" class="job-row" data-job="'+safe(job.id)+'"><span class="job-logo '+color+'">'+safe(job.badge||job.company.slice(0,1))+'</span><span class="job-copy"><strong>'+safe(job.title)+'</strong><span class="job-meta">'+safe([job.company,job.city,job.type].filter(Boolean).join(" · "))+'</span><span class="job-tags"><span class="chip '+color+'">'+safe(job.industry)+'</span><span class="chip">'+safe(info)+'</span></span></span><span class="job-side"><span class="status-pill '+entry.stage+'">'+stages[entry.stage]+"</span>"+(sub?"<small>"+safe(sub)+"</small>":"")+'</span><i class="job-arrow" data-icon="chevron"></i></button>';
  }).join(""):'<p class="empty">当前筛选下没有岗位。<br>可以调整筛选或添加一个岗位。</p>';
  drawIcons($("jobs"));
}
function setView(view) {
  activeView=view;
  document.querySelectorAll(".nav [data-view]").forEach((button)=>{
    const current=button.dataset.view===view;
    button.classList.toggle("current",current);
    if(current) button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  });
  [$("breadcrumb").textContent,$("boardTitle").textContent,$("boardDescription").textContent]=views[view];
  $("addJob").innerHTML=view==="resume"?icon("upload")+"批量关联简历":icon("plus")+"添加岗位";
  render();
}
const block=(title,body)=>"<section><h3>"+title+"</h3>"+body+"</section>";
const paragraph=(value)=>"<p>"+safe(value)+"</p>";
const list=(items)=>"<ul>"+items.map((item)=>"<li>"+safe(item)+"</li>").join("")+"</ul>";
const link=(href,label)=>{
  try {
    if(!["https:","http:","mailto:"].includes(new URL(href).protocol)) return "";
    return '<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(label)+"</a>";
  } catch {return "";}
};
const shortDate=(value)=>new Date(value).toLocaleString("zh-CN",{hour12:false});
function detailContent(job,entry) {
  if(activeTab==="jd") return [
    job.availabilityDetail?block("招聘状态",'<div class="info">'+paragraph(job.availabilityDetail)+"</div>"):"",
    job.duties?.length?block("岗位职责",list(job.duties)):"",
    job.requirements?.length?block("任职要求",list(job.requirements)):"",
    job.description?block("补充 JD",paragraph(job.description)):"",
    job.school?block("院校与适配判断",paragraph(job.school)):"",
    block("招聘来源",'<div class="source-links">'+([...(job.sources??[]),...(job.source?[[job.source,"招聘原文"]]:[]),...(job.email?[["mailto:"+job.email,job.email]]:[])].map(([href,label])=>link(href,label)).join("")||"<p>暂无链接</p>")+"</div>"),
    '<div class="field-actions"><button class="text-button" data-detail="edit">编辑岗位</button><button class="text-button danger" data-detail="remove">移除岗位</button></div>'
  ].join("");
  if(activeTab==="resume") return [
    job.tips?.length?block("这个岗位的改写重点",list(job.tips)):"",
    block("岗位专属附件",entry.attachment?
      '<div class="attachment"><b>'+safe(entry.attachment.name)+'</b><div class="field-actions"><button class="secondary" data-detail="download">下载</button><button class="text-button danger" data-detail="detach">移除附件</button></div></div>':
      paragraph(job.resumeMatch?"选择对应岗位的 PDF，或在简历管理批量关联。文件只保存在这个浏览器。":"上传该岗位的 PDF、DOCX 或文本简历。")),
    '<div class="field-actions"><button class="secondary" data-detail="attach">'+icon("upload")+'选择文件</button><input type="file" id="singleFile" accept=".pdf,.docx,.txt" hidden></div>',
    '<label>可编辑简历草稿<textarea id="resumeText" rows="9" maxlength="35000" placeholder="为这个岗位维护独立的简历文本。">'+safe(entry.resume)+'</textarea></label><div class="field-actions"><button class="primary" data-detail="save-resume">保存草稿</button><button class="secondary" data-detail="text-download">下载文本</button></div>'
  ].join("");
  return [
    '<label>下次跟进日期<input id="followUp" type="date" value="'+safe(entry.followUp)+'"></label>',
    '<label>投递与沟通备注<textarea id="notes" rows="5" maxlength="12000" placeholder="记录投递渠道、面试安排或招聘方反馈。">'+safe(entry.notes)+'</textarea></label>',
    '<div class="field-actions"><button class="primary" data-detail="save-notes">保存跟进</button></div>',
    block("阶段记录",entry.history.length?'<ul class="history">'+entry.history.slice().reverse().map((item)=>"<li><strong>"+safe(stages[item.stage])+"</strong><br><time>"+safe(shortDate(item.at))+"</time></li>").join("")+"</ul>":paragraph("更新投递阶段后，这里会记录变更时间。"))
  ].join("");
}
function renderDetail() {
  const job=allJobs().find((item)=>item.id===activeJob);
  if(!job) return;
  const entry=entryFor(job.id);
  const tabs={jd:"岗位 JD",resume:"定制简历",track:"进度与备注"};
  const source=job.apply||job.source||job.sources?.[0]?.[0];
  const apply=source?link(source,job.applyLabel||"招聘入口").replace("<a ","<a class=\"secondary\" "):"";
  $("jobDetail").innerHTML='<header class="drawer-head"><div class="drawer-top"><div><div class="eyebrow">'+safe(job.company)+'</div><h2 id="dialogTitle">'+safe(job.title)+'</h2></div><button class="icon-button" data-close="jobDialog" aria-label="关闭">'+icon("x")+'</button></div><p class="drawer-meta">'+safe([job.city,job.type,job.deadline?"截止 "+job.deadline:""].filter(Boolean).join(" · "))+'</p><div class="drawer-actions"><label class="stage-label" for="stage">投递阶段</label><select class="stage-select" id="stage">'+options(stages)+'</select>'+apply+'</div></header><div class="drawer-tabs" role="tablist" aria-label="岗位详情">'+Object.entries(tabs).map(([id,label])=>'<button class="drawer-tab" type="button" role="tab" id="tab-'+id+'" aria-controls="detailPanel" aria-selected="'+(activeTab===id)+'" data-tab="'+id+'">'+label+'</button>').join("")+'</div><div class="drawer-body" id="detailPanel" role="tabpanel" aria-labelledby="tab-'+activeTab+'">'+detailContent(job,entry)+"</div>";
  $("stage").value=entry.stage;
}
function openJob(id) {
  activeJob=id;
  activeTab=activeView==="resume"?"resume":activeView==="track"?"track":"jd";
  renderDetail();
  $("jobDialog").showModal();
}
function openEdit(job) {
  editing=job?.id??null;
  $("jobForm").reset();
  $("editTitle").textContent=job?"编辑岗位":"添加岗位";
  if(job) {
    for(const name of ["company","title","city","industry","type","deadline","source","description"]) {
      $("jobForm").elements.namedItem(name).value=job[name]??"";
    }
  }
  $("editDialog").showModal();
}
function confirmAction(message,action) {
  confirmation=action;
  $("confirmMessage").textContent=message;
  $("confirmDialog").showModal();
}
function saveFile(blob,name) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
const fileToData=(file)=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(reader.error);
  reader.readAsDataURL(file);
});
async function attachFiles(files,id) {
  let attached=0;
  let skipped=0;
  try {
    for(const file of files) {
      const job=id?allJobs().find((item)=>item.id===id):allJobs().find((item)=>item.resumeMatch&&file.name.startsWith(item.resumeMatch));
      if(!job||file.size===0||file.size>5*1024*1024||!/\.(pdf|docx|txt)$/i.test(file.name)) {skipped++;continue;}
      const data=await fileToData(file);
      const entry=entryFor(job.id);
      const changes={attachment:{name:file.name,data}};
      if(entry.stage==="todo") {
        changes.stage="ready";
        changes.history=[...entry.history,{stage:"ready",at:new Date().toISOString()}];
      }
      updateEntry(job.id,changes);
      attached++;
    }
  } catch {skipped++;}
  if(attached) {
    await saveState("已关联 "+attached+" 份简历"+(skipped?"，跳过 "+skipped+" 份":"")+"。");
    render();
    if($("jobDialog").open) renderDetail();
  } else notify("没有可关联的文件。请选择匹配岗位的 PDF、DOCX 或文本，单份不超过 5 MB。");
}
function validBackup(value) {
  const record=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const str=(v)=>typeof v==="string";
  const strings=(v)=>Array.isArray(v)&&v.every(str);
  const links=(v)=>Array.isArray(v)&&v.every((item)=>strings(item)&&item.length===2);
  const isId=(v)=>str(v)&&/^[a-z0-9-]{1,80}$/.test(v);
  if(!record(value)||value.version!==1||!Array.isArray(value.jobs)||!Array.isArray(value.removed)||!record(value.entries)) return false;
  if(!value.removed.every(isId)) return false;
  const fields=["city","type","deadline","source","description"];
  if(!value.jobs.every((job)=>record(job)&&isId(job.id)&&str(job.company)&&str(job.title)&&industries.includes(job.industry)&&fields.every((key)=>str(job[key]))&&Object.keys(job).every((key)=>["id","company","title","industry",...fields].includes(key)))) return false;
  return Object.entries(value.entries).every(([id,entry])=>{
    if(!isId(id)||!record(entry)||!Object.hasOwn(stages,entry.stage)||!["resume","notes","followUp"].every((key)=>str(entry[key]))) return false;
    if(!Array.isArray(entry.history)||!entry.history.every((item)=>record(item)&&Object.hasOwn(stages,item.stage)&&str(item.at)&&Number.isFinite(Date.parse(item.at)))) return false;
    const a=entry.attachment;
    return a===null||(record(a)&&str(a.name)&&/\.(pdf|docx|txt)$/i.test(a.name)&&str(a.data)&&/^data:[\w.+/;-]*;base64,[A-Za-z0-9+/=]+$/.test(a.data)&&a.data.length<7200000);
  });
}
function detailAction(action) {
  const job=allJobs().find((item)=>item.id===activeJob);
  if(!job) return;
  const entry=entryFor(job.id);
  if(action==="edit") openEdit(job);
  if(action==="remove") confirmAction("移除这个岗位及其投递记录和附件？",()=>{
    state.removed.push(job.id);
    state.jobs=state.jobs.filter((item)=>item.id!==job.id);
    delete state.entries[job.id];
    $("jobDialog").close();
    render();
    void saveState("岗位已移除。");
  });
  if(action==="attach") $("singleFile").click();
  if(action==="download"&&entry.attachment) {
    fetch(entry.attachment.data).then((response)=>response.blob()).then((blob)=>saveFile(blob,entry.attachment.name)).catch(()=>notify("暂时无法下载附件。"));
  }
  if(action==="detach") confirmAction("移除当前简历附件？",()=>{
    updateEntry(job.id,{attachment:null});
    renderDetail();
    render();
    void saveState("附件已移除。");
  });
  if(action==="save-resume") {
    updateEntry(job.id,{resume:$("resumeText").value});
    render();
    void saveState("草稿已保存。");
  }
  if(action==="text-download") {
    const text=$("resumeText").value.trim();
    if(text) saveFile(new Blob([text],{type:"text/plain;charset=utf-8"}),job.company+"-"+job.title+".txt");
    else notify("请先输入简历草稿。");
  }
  if(action==="save-notes") {
    updateEntry(job.id,{notes:$("notes").value,followUp:$("followUp").value});
    render();
    void saveState("跟进记录已保存。");
  }
}
async function init() {
  try {
    database=await openStorage();
    state=(await readState())??freshState();
  } catch {notify("浏览器存储暂不可用。请在使用后导出备份。");}
  drawIcons(document);
  $("industry").innerHTML=options({"":"全部行业",...industryOptions});
  $("formIndustry").innerHTML=options(industryOptions);
  $("status").innerHTML=options({"":"全部状态",waiting:"待投或简历就绪",active:"已投 / 面试 / Offer",...stages});
  setView("all");
}
$("search").addEventListener("input",render);
for(const id of ["industry","status"]) $(id).addEventListener("change",render);
document.querySelector(".nav").addEventListener("click",(event)=>{
  const button=event.target.closest("[data-view]");
  if(button) {
    $("status").value="";
    setView(button.dataset.view);
  }
});
$("stats").addEventListener("click",(event)=>{
  const button=event.target.closest("[data-filter]");
  if(!button) return;
  $("status").value=button.dataset.filter==="resume"?"":button.dataset.filter;
  setView(button.dataset.filter==="resume"?"resume":button.dataset.filter?"track":"all");
});
$("jobs").addEventListener("click",(event)=>{
  const row=event.target.closest("[data-job]");
  if(row) openJob(row.dataset.job);
});
$("addJob").addEventListener("click",()=>{if(activeView==="resume") $("batchFile").click();else openEdit();});
$("batchFile").addEventListener("change",(event)=>{
  void attachFiles([...event.target.files]);
  event.target.value="";
});
$("jobDetail").addEventListener("change",(event)=>{
  if(event.target.id==="stage") {
    const entry=entryFor(activeJob);
    if(entry.stage===event.target.value) return;
    updateEntry(activeJob,{stage:event.target.value,history:[...entry.history,{stage:event.target.value,at:new Date().toISOString()}]});
    render();
    if(activeTab==="track") {
      const notes=$("notes").value;
      const followUp=$("followUp").value;
      renderDetail();
      $("notes").value=notes;
      $("followUp").value=followUp;
    }
    void saveState("投递阶段已更新。");
  }
  if(event.target.id==="singleFile") void attachFiles([...event.target.files],activeJob);
});
$("jobDetail").addEventListener("click",(event)=>{
  const button=event.target.closest("[data-tab],[data-detail]");
  if(!button) return;
  if(button.dataset.tab) {
    activeTab=button.dataset.tab;
    renderDetail();
    $("tab-"+activeTab).focus();
  }
  if(button.dataset.detail) detailAction(button.dataset.detail);
});
document.addEventListener("click",(event)=>{
  const button=event.target.closest("[data-close]");
  if(button) $(button.dataset.close).close();
});
$("jobForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const fields=Object.fromEntries([...new FormData(event.target)].map(([key,value])=>[key,value.trim()]));
  if(!fields.company||!fields.title) {notify("请填写公司和岗位名称。");return;}
  if(fields.source&&!/^https?:\/\//i.test(fields.source)) {notify("请填写以 https:// 或 http:// 开头的招聘链接。");return;}
  const id=editing??crypto.randomUUID();
  const job={id,...fields};
  const index=state.jobs.findIndex((item)=>item.id===id);
  if(index<0) state.jobs.push(job);
  else state.jobs[index]=job;
  $("editDialog").close();
  render();
  if(editing&&$("jobDialog").open) renderDetail();
  void saveState("岗位已保存。");
});
$("confirmAction").addEventListener("click",()=>{
  $("confirmDialog").close();
  confirmation?.();
  confirmation=null;
});
$("export").addEventListener("click",()=>{
  const date=new Date().toISOString().slice(0,10);
  saveFile(new Blob([JSON.stringify(state)],{type:"application/json"}),"求职工作台备份-"+date+".json");
  notify("已导出备份，内含已关联的简历附件。");
});
$("import").addEventListener("click",()=>$("importFile").click());
$("importFile").addEventListener("change",async(event)=>{
  const [file]=event.target.files;
  event.target.value="";
  if(!file) return;
  try {
    if(file.size>60*1024*1024) throw new Error("File too large");
    const next=JSON.parse(await file.text());
    if(!validBackup(next)) throw new Error("Invalid backup");
    confirmAction("导入将替换当前浏览器里的岗位变更、投递记录和简历附件。",()=>{
      state=next;
      render();
      void saveState("备份已导入。");
    });
  } catch {notify("无法读取备份。请选择从求职工作台导出的 JSON 文件。");}
});
void init();

