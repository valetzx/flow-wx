// 验证码回调函数
function captchaCallback(res) {
    console.log('验证结果:', res);
    
    if (res.ret === 0) {
        // 验证成功，执行主页跳转
        window.location.href = '/';
        
        // 复制结果至剪切板
        const str = `【randstr】->【${res.randstr}】      【ticket】->【${res.ticket}】`;
        const input = document.createElement('input');
        input.value = str;
        document.body.appendChild(input);
        input.select();
        document.execCommand("Copy");
        document.body.removeChild(input);
    }
}

// 验证码JS加载错误处理函数
function handleCaptchaLoadError() {
    const appid = '190133993'; // 替换为你的实际AppId
    // 生成容灾票据
    const ticket = `terror_1001_${appid}_${Math.floor(new Date().getTime() / 1000)}`;
    captchaCallback({
        ret: 0,
        randstr: '@' + Math.random().toString(36).substr(2),
        ticket: ticket,
        errorCode: 1001,
        errorMessage: 'jsload_error'
    });
}

// 初始化验证码事件监听
function initCaptcha() {
    const verifiedBtn = document.getElementById('homeVerifiedBtn');
    if (verifiedBtn) {
        verifiedBtn.addEventListener('click', function(e) {
            // 阻止默认链接跳转行为
            e.preventDefault();
            
            try {
                // 生成验证码对象（请替换为您的CaptchaAppId）
                const captcha = new TencentCaptcha('190133993', captchaCallback, {});
                // 显示验证码
                captcha.show();
            } catch (error) {
                // 加载异常处理
                handleCaptchaLoadError();
            }
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
  (window.commonReady ? window.commonReady : Promise.resolve()).then(() => {
    initCaptcha();   // 等 sidebar.html 注入后再绑事件
  });
});
