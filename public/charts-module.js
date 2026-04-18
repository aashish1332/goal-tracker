/**
 * TrackerPro — Charts Module
 */

let chartDoughnut = null, chartBar = null, chartLine = null;

export const renderCharts = (rawGoals, chartReady) => {
    if (!chartReady) return;
    let total=0, completed=0, highCount=0, medCount=0, lowCount=0;
    for (let i=0; i<rawGoals.length; i++) {
      total++;
      if(rawGoals[i].completed) completed++;
      if(rawGoals[i].priority==='High') highCount++;
      else if(rawGoals[i].priority==='Medium') medCount++;
      else lowCount++;
    }
    const pending = total - completed;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = dark ? '#a1a1a6' : '#86868b';
    const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    // Doughnut
    if (chartDoughnut) {
      chartDoughnut.data.datasets[0].data = [completed, pending];
      chartDoughnut.update('none');
    } else {
      const dCtx = document.getElementById('doughnutChart')?.getContext('2d');
      if(dCtx) chartDoughnut = new Chart(dCtx, {type:'doughnut',data:{labels:['Completed','Pending'],datasets:[{data:[completed,pending],backgroundColor:['#00ff7f','#ffd700'],borderWidth:0,hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',animation:false,plugins:{legend:{position:'bottom',labels:{color:textColor,padding:14,font:{size:12}}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed}`}}}}});
    }

    // Bar
    if (chartBar) {
      chartBar.data.datasets[0].data = [highCount, medCount, lowCount];
      chartBar.update('none');
    } else {
      const bCtx = document.getElementById('barChart')?.getContext('2d');
      if(bCtx) chartBar = new Chart(bCtx, {type:'bar',data:{labels:['🔥 High','⚡ Medium','🌱 Low'],datasets:[{label:'Goals',data:[highCount,medCount,lowCount],backgroundColor:['rgba(255,77,79,0.75)','rgba(255,215,0,0.75)','rgba(0,255,127,0.75)'],borderRadius:8,barThickness:32}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true,grid:{color:gridColor},ticks:{stepSize:1,color:textColor,font:{size:11}}},x:{grid:{display:false},ticks:{color:textColor,font:{size:11}}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y} goal${ctx.parsed.y!==1?'s':''}`}}}}});
    }

    // Line
    const labels = rawGoals.map(g => g.title.length > 18 ? g.title.slice(0,18)+'…' : g.title);
    const data   = rawGoals.map(g => Number(g.progress));
    if (chartLine) {
      chartLine.data.labels = labels.length ? labels : ['No goals yet'];
      chartLine.data.datasets[0].data = data.length ? data : [0];
      chartLine.data.datasets[0].pointBackgroundColor = data.map(v => v>=80?'#00ff7f':v>=40?'#ffd700':'#ff8c00');
      chartLine.update('none');
    } else {
      const lCtx = document.getElementById('lineChart')?.getContext('2d');
      if(lCtx) chartLine = new Chart(lCtx, {type:'line',data:{labels:labels.length?labels:['No goals yet'],datasets:[{label:'Progress %',data:data.length?data:[0],borderColor:'rgba(255,140,0,0.9)',backgroundColor:'rgba(255,140,0,0.1)',pointBackgroundColor:data.map(v=>v>=80?'#00ff7f':v>=40?'#ffd700':'#ff8c00'),pointRadius:5,pointHoverRadius:7,tension:0.4,fill:true,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true,max:100,grid:{color:gridColor},ticks:{color:textColor,font:{size:11},callback:v=>v+'%'}},x:{grid:{display:false},ticks:{color:textColor,font:{size:11},maxRotation:30}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y}% complete`}}}}});
    }
};
